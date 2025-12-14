import {
    App,
    Editor,
    MarkdownView,
    Notice,
    Plugin,
    PluginSettingTab,
    Setting,
    TFile,
    FrontMatterCache,
} from 'obsidian';

import { join } from 'path';

interface MarkdeepSlidesSettings {
    slidesPath: string;
}

const DEFAULT_SETTINGS: MarkdeepSlidesSettings = {
    slidesPath: 'slides',
};

const SCRIPT_TO_APPEND = `
<script src="markdeep-slides/slides-init.js"></script>
`;

export default class MarkdeepSlidesPlugin extends Plugin {
    settings: MarkdeepSlidesSettings;
    private debouncedGenerateSlides: (editor: Editor, view: MarkdownView) => void;

    async onload() {
        await this.loadSettings();

        // --- Debounce Function ---
        let timeout: NodeJS.Timeout;
        this.debouncedGenerateSlides = (editor: Editor, view: MarkdownView) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                if (view.file) {
                    this.generateSlides(view.file, true);
                }
            }, 500); // 500ms delay
        };

        // --- Event Listener for Editor Changes ---
        this.registerEvent(
            this.app.workspace.on('editor-change', this.debouncedGenerateSlides)
        );

        // --- Command to Manually Generate Slides ---
        this.addCommand({
            id: 'generate-markdeep-slides',
            name: 'Generate Markdeep Slides for current file',
            callback: () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    this.generateSlides(activeFile, false);
                } else {
                    new Notice('No active file to generate slides from.');
                }
            },
        });

        // --- Settings Tab ---
        this.addSettingTab(new MarkdeepSlidesSettingTab(this.app, this));

        console.log('Markdeep Slides plugin loaded.');
    }

    onunload() {
        console.log('Markdeep Slides plugin unloaded.');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async generateSlides(file: TFile, isAuto: boolean) {
        if (!file || file.extension !== 'md') {
            return;
        }

        const fileCache = this.app.metadataCache.getFileCache(file);
        const frontmatter = fileCache?.frontmatter;

        if (!this.hasMdslidesTag(frontmatter)) {
            if (!isAuto) {
                new Notice('File does not have "mdslides" in its tags. Slides not generated.');
            }
            return;
        }

        try {
            let content = await this.app.vault.read(file);

            // Remove YAML frontmatter
            if (frontmatter) {
                const frontmatterPosition = fileCache.frontmatterPosition;
                if (frontmatterPosition) {
                    content = content.substring(frontmatterPosition.end.line + 1);
                }
            }
            
            // Append the script
            const finalHtml = content + SCRIPT_TO_APPEND;

            // Determine output path
            const outputDir = this.settings.slidesPath;
            const outputFileName = `${file.basename}.html`;
            const outputPath = join(outputDir, outputFileName);
            
            // Ensure directory exists
            try {
                await this.app.vault.createFolder(outputDir);
            } catch (e) {
                // Folder likely already exists, ignore error
            }

            const existingFile = this.app.vault.getAbstractFileByPath(outputPath);
            if (existingFile && existingFile instanceof TFile) {
                await this.app.vault.modify(existingFile, finalHtml);
            } else {
                await this.app.vault.create(outputPath, finalHtml);
            }

            if (!isAuto) {
                new Notice(`Slides generated successfully at: ${outputPath}`);
            }
             console.log(`Slides for ${file.basename} processed.`);

        } catch (error) {
            console.error('Error generating slides:', error);
            if (!isAuto) {
                new Notice('Failed to generate slides. See console for details.');
            }
        }
    }

    private hasMdslidesTag(frontmatter: FrontMatterCache | undefined): boolean {
        if (!frontmatter || !frontmatter.tags) {
            return false;
        }

        const tags = frontmatter.tags;
        if (typeof tags === 'string') {
            return tags.split(',').map(t => t.trim()).includes('mdslides');
        }
        if (Array.isArray(tags)) {
            return tags.includes('mdslides');
        }

        return false;
    }
}

class MarkdeepSlidesSettingTab extends PluginSettingTab {
    plugin: MarkdeepSlidesPlugin;

    constructor(app: App, plugin: MarkdeepSlidesPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();
        containerEl.createEl('h2', { text: 'Markdeep Slides Settings' });

        new Setting(containerEl)
            .setName('Slides output path')
            .setDesc('The vault path to save the generated HTML slide files.')
            .addText(text => text
                .setPlaceholder('e.g., slides')
                .setValue(this.plugin.settings.slidesPath)
                .onChange(async (value) => {
                    this.plugin.settings.slidesPath = value;
                    await this.plugin.saveSettings();
                }));
    }
}

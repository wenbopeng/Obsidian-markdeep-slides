import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

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
    ItemView, 
    WorkspaceLeaf, 
    ViewState
} from 'obsidian';

import { join } from 'path';

// This new script saves the slide position (hash) to session storage before a reload
// and restores it after the reload, allowing for stateful refreshes.
const STATE_RECOVERY_SCRIPT = `
<script>
    window.addEventListener('DOMContentLoaded', () => {
        const savedHash = window.sessionStorage.getItem('markdeep_slide_hash');
        if (savedHash && !window.location.hash) {
            window.location.hash = savedHash;
        }
        window.sessionStorage.removeItem('markdeep_slide_hash'); // Clean up
    });
    window.addEventListener('beforeunload', () => {
        if (window.location.hash) {
            window.sessionStorage.setItem('markdeep_slide_hash', window.location.hash);
        }
    });
</script>
`;

export const SLIDES_VIEW_TYPE = 'markdeep-slides-view';

export class SlidesView extends ItemView {
    private url: string;
    private htmlPath: string;
    plugin: MarkdeepSlidesPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: MarkdeepSlidesPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return SLIDES_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Slide Preview';
    }

    getIcon(): string {
        return 'presentation';
    }
    
    async setState(state: any, options: any): Promise<void> {
        this.url = state.url;
        this.htmlPath = state.htmlPath;
        await this.onOpen();
        return super.setState(state, options);
    }

    getState() {
        const state = super.getState();
        state.url = this.url;
        state.htmlPath = this.htmlPath;
        return state;
    }

    async onOpen() {
        this.contentEl.empty();
        this.contentEl.style.height = '100%';
        this.contentEl.style.display = 'flex';
        this.contentEl.style.flexDirection = 'column';

        if (!this.url) {
            this.contentEl.createEl('h2', { text: 'No URL specified' });
            return;
        }

        const container = this.contentEl.createEl('div');
        container.style.flexGrow = '1';
        container.innerHTML = `<webview src="${this.url}" style="width:100%; height:100%; border:none;" webpreferences="allowRunningInsecureContent"></webview>`;

        const webview = container.find('webview');

        if (webview) {
            webview.addEventListener('dom-ready', () => {
                // Optional: You can interact with the webview content here
            });
            webview.addEventListener('did-fail-load', (event: any) => {
                console.error('Failed to load slides:', event);
                this.contentEl.createEl('h2', { text: 'Error Loading Slides' });
            });
        }
    }

    async onClose() {
        if (this.htmlPath) {
            this.plugin.removeSlideView(this.htmlPath);
        }
    }
}


export class HttpServer {
    private server: http.Server | null = null;
    private port: number;
    private slidesPath: string;

    constructor(port: number, slidesPath: string) {
        this.port = port;
        this.slidesPath = slidesPath;
    }

    start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server = http.createServer(this.requestHandler.bind(this));
            this.server.listen(this.port, () => {
                console.log(`Server running at http://localhost:${this.port}/`);
                resolve();
            });
            this.server.on('error', (e: NodeJS.ErrnoException) => {
                if (e.code === 'EADDRINUSE') {
                    reject(new Error(`Port ${this.port} is already in use.`));
                } else {
                    reject(e);
                }
            });
        });
    }

    stop(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.server) {
                this.server.close((err: any) => {
                    if (err) return reject(err);
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    private async requestHandler(req: http.IncomingMessage, res: http.ServerResponse) {
        if (!req.url) {
            res.statusCode = 400;
            res.end('Bad Request: No URL');
            return;
        }
        const decodedUrl = decodeURIComponent(req.url);
        let filePath = path.join(this.slidesPath, decodedUrl);
        if (!filePath.startsWith(this.slidesPath)) {
            res.statusCode = 403;
            res.end('Forbidden');
            return;
        }
        
        fs.readFile(filePath, (err: any, data: any) => {
            if (err) {
                res.statusCode = err.code === 'ENOENT' ? 404 : 500;
                res.end(err.code === 'ENOENT' ? 'File not found.' : `Server error: ${err.message}`);
                return;
            }
            const ext = path.extname(filePath).toLowerCase();
            let contentType = 'text/plain';
            switch (ext) {
                case '.html': contentType = 'text/html'; break;
                case '.css': contentType = 'text/css'; break;
                case '.js': contentType = 'application/javascript'; break;
                case '.json': contentType = 'application/json'; break;
                case '.png': contentType = 'image/png'; break;
                case '.jpg': case '.jpeg': contentType = 'image/jpeg'; break;
                case '.gif': contentType = 'image/gif'; break;
                case '.svg': contentType = 'image/svg+xml'; break;
            }
            res.setHeader('Content-Type', contentType);
            res.statusCode = 200;
            res.end(data);
        });
    }
    
    setSlidesPath(newPath: string) {
        this.slidesPath = newPath;
    }
}

interface MarkdeepSlidesSettings {
    slidesPath: string;
    port: number;
}

const DEFAULT_SETTINGS: MarkdeepSlidesSettings = {
    slidesPath: 'slides',
    port: 8765,
};

export default class MarkdeepSlidesPlugin extends Plugin {
    settings: MarkdeepSlidesSettings;
    private debouncedGenerateSlides: (editor: Editor, view: MarkdownView) => void;
    private httpServer: HttpServer;
    private slideViews: Map<string, SlidesView> = new Map();

    async onload() {
        await this.loadSettings();

        const vaultBasePath = (this.app.vault.adapter as any).getBasePath();
        const absoluteSlidesPath = join(vaultBasePath, this.settings.slidesPath);
        this.httpServer = new HttpServer(this.settings.port, absoluteSlidesPath);
        try {
            await this.httpServer.start();
        } catch (e) {
            new Notice(`Failed to start local server: ${e.message}`);
            console.error('Failed to start local server:', e);
        }
        
        this.registerEvent(this.app.vault.on('modify', (file) => {
            if (file instanceof TFile && this.slideViews.has(file.path)) {
                const view = this.slideViews.get(file.path);
                if (view) {
                    const webview = view.contentEl.querySelector('webview');
                    if (webview) {
                        (webview as any).reload();
                    }
                }
            }
        }));

        let timeout: NodeJS.Timeout;
        this.debouncedGenerateSlides = (editor: Editor, view: MarkdownView) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                if (view.file) this.generateSlides(view.file, true);
            }, 3000);
        };

        this.registerEvent(this.app.workspace.on('editor-change', this.debouncedGenerateSlides));

        this.addCommand({
            id: 'generate-markdeep-slides',
            name: 'Generate Markdeep Slides for current file',
            callback: () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) this.generateSlides(activeFile, false);
                else new Notice('No active file to generate slides from.');
            },
        });

        this.addCommand({
            id: 'open-slides-in-browser',
            name: 'Open Slides in Browser',
            callback: () => this.openSlidesInBrowser(),
        });

        this.addCommand({
            id: 'open-slides-in-external-browser',
            name: 'Open Slides in External Browser',
            callback: () => this.openSlidesInExternalBrowser(),
        });

        this.addSettingTab(new MarkdeepSlidesSettingTab(this.app, this));

        this.registerView(
            SLIDES_VIEW_TYPE,
            (leaf) => new SlidesView(leaf, this)
        );

        console.log('Markdeep Slides plugin loaded.');
    }

    onunload() {
        console.log('Markdeep Slides plugin unloaded.');
        if (this.httpServer) this.httpServer.stop();
        this.slideViews.clear();
    }
    
    public removeSlideView(htmlPath: string) {
        this.slideViews.delete(htmlPath);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        if (this.httpServer) {
            const vaultBasePath = (this.app.vault.adapter as any).getBasePath();
            const absoluteSlidesPath = join(vaultBasePath, this.settings.slidesPath);
            this.httpServer.setSlidesPath(absoluteSlidesPath);
        }
    }

    private async openSlidesInExternalBrowser() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== 'md') {
            new Notice('No active Markdown file.');
            return;
        }

        const frontmatter = this.app.metadataCache.getFileCache(activeFile)?.frontmatter;
        if (!this.hasMdslidesTag(frontmatter)) {
            new Notice('File does not have "mdslides" in its tags.');
            return;
        }

        const htmlPath = join(this.settings.slidesPath, `${activeFile.basename}.html`);
        const htmlFile = this.app.vault.getAbstractFileByPath(htmlPath);

        if (!htmlFile) await this.generateSlides(activeFile, false);

        const slideUrl = `http://localhost:${this.settings.port}/${activeFile.basename}.html`;
        window.open(slideUrl, '_blank');
        new Notice(`Opening slides in external browser...`);
    }
    
    async openSlidesInBrowser() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== 'md') {
            new Notice('No active Markdown file.');
            return;
        }

        const frontmatter = this.app.metadataCache.getFileCache(activeFile)?.frontmatter;
        if (!this.hasMdslidesTag(frontmatter)) {
            new Notice('File does not have "mdslides" in its tags.');
            return;
        }

        const htmlPath = join(this.settings.slidesPath, `${activeFile.basename}.html`);
        const htmlFile = this.app.vault.getAbstractFileByPath(htmlPath);

        if (!htmlFile) await this.generateSlides(activeFile, false);

        const slideUrl = `http://localhost:${this.settings.port}/${activeFile.basename}.html`;

        this.app.workspace.detachLeavesOfType(SLIDES_VIEW_TYPE);

        const leaf = this.app.workspace.getLeaf('split', 'vertical');

        await leaf.setViewState({
            type: SLIDES_VIEW_TYPE,
            active: true,
            state: { url: slideUrl, htmlPath: htmlPath }
        });
        
        this.app.workspace.revealLeaf(leaf);

        const view = leaf.view as SlidesView;
        this.slideViews.set(htmlPath, view);

        new Notice(`Opening slides in a new pane.`);
    }
    
    async generateSlides(file: TFile, isAuto: boolean) {
        if (!file || file.extension !== 'md') return;

        const fileCache = this.app.metadataCache.getFileCache(file);
        if (!this.hasMdslidesTag(fileCache?.frontmatter)) {
            if (!isAuto) new Notice('File does not have "mdslides" in its tags. Slides not generated.');
            return;
        }

        try {
            const fileContent = await this.app.vault.read(file);
                        const frontmatterRegex = /^---\s*[\s\S]*?---\s*$/m;
            const content = fileContent.replace(frontmatterRegex, '');
            let htmlToProcess = content;

            const metaCharset = '<meta charset="utf-8">';
            if (htmlToProcess.includes('</head>')) {
                htmlToProcess = htmlToProcess.replace('</head>', `${metaCharset}\n</head>`);
            } else {
                htmlToProcess = `${metaCharset}\n${htmlToProcess}`;
            }

            const SCRIPT_TO_APPEND = `\n<script src="markdeep-slides/slides-init.js"></script>`;
            const fullScript = `${STATE_RECOVERY_SCRIPT}\n${SCRIPT_TO_APPEND}`;

            if (htmlToProcess.includes('</body>')) {
                htmlToProcess = htmlToProcess.replace('</body>', `${fullScript}\n</body>`);
            } else {
                htmlToProcess = htmlToProcess + fullScript;
            }

            const finalHtml = htmlToProcess;
            const outputDir = this.settings.slidesPath;
            const outputPath = join(outputDir, `${file.basename}.html`);
            
            try {
                await this.app.vault.createFolder(outputDir);
            } catch (e) { /* Folder likely already exists */ }

            const existingFile = this.app.vault.getAbstractFileByPath(outputPath);
            if (existingFile instanceof TFile) {
                await this.app.vault.modify(existingFile, finalHtml);
            } else {
                await this.app.vault.create(outputPath, finalHtml);
            }

            if (!isAuto) new Notice(`Slides generated successfully at: ${outputPath}`);
            console.log(`Slides for ${file.basename} processed.`);

        } catch (error) {
            console.error('Error generating slides:', error);
            if (!isAuto) new Notice('Failed to generate slides. See console for details.');
        }
    }

    private hasMdslidesTag(frontmatter: FrontMatterCache | undefined): boolean {
        if (!frontmatter?.tags) return false;
        const tags = frontmatter.tags;
        if (typeof tags === 'string') {
            return tags.split(',').map(t => t.trim()).includes('mdslides');
        }
        return Array.isArray(tags) ? tags.includes('mdslides') : false;
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

        new Setting(containerEl)
            .setName('Server port')
            .setDesc('The local server port to use. Requires plugin reload to take effect.')
            .addText(text => text
                .setPlaceholder('e.g., 8765')
                .setValue(this.plugin.settings.port.toString())
                .onChange(async (value) => {
                    this.plugin.settings.port = value ? parseInt(value) : 8765;
                    await this.plugin.saveSettings();
                }));
    }
}

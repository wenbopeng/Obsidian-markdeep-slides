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

// ... (rest of the file remains the same, but the import for SlidesView is removed and the class is added)
// The import to remove is: import { SlidesView, SLIDES_VIEW_TYPE } from './view';

// Add the content of view.ts here
export const SLIDES_VIEW_TYPE = 'markdeep-slides-view';

export class SlidesView extends ItemView {
    private url: string;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType(): string {
        return SLIDES_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Slide Preview';
    }

    getIcon(): string {
        return 'presentation'; // Choose a relevant icon
    }
    
    async setState(state: any, options: any): Promise<void> {
        this.url = state.url;
        await this.onOpen();
        return super.setState(state, options);
    }

    getState() {
        const state = super.getState();
        state.url = this.url;
        return state;
    }

    async onOpen() {
        this.contentEl.empty();
        this.contentEl.style.height = '100%'; // Ensure content element takes full height
        this.contentEl.style.display = 'flex'; // Use flexbox for layout
        this.contentEl.style.flexDirection = 'column'; // Stack elements vertically

        this.contentEl.createEl('h2', { text: 'Loading Slides...' });

        if (!this.url) {
            this.contentEl.empty();
            this.contentEl.createEl('h2', { text: 'No URL specified' });
            return;
        }

        // Use a webview to display the slides
        // Note: The 'webview' tag is an Electron feature. We create it this way to avoid TypeScript errors.
        const container = this.contentEl.createEl('div');
        container.style.flexGrow = '1'; // Allow container to grow and fill available space
        container.innerHTML = `<webview src="${this.url}" style="width:100%; height:100%; border:none;"></webview>`;

        const webview = container.find('webview');

        if (webview) {
            // No need to set height here as it's set in innerHTML
            // webview.style.height = '100%'; // Ensure webview inside container takes full height
            webview.style.border = 'none';

            webview.addEventListener('dom-ready', () => {
                // Optional: You can interact with the webview content here
                this.contentEl.removeChild(this.contentEl.children[0]); // Remove "Loading..."
            });

            webview.addEventListener('did-fail-load', (event: any) => {
                console.error('Failed to load slides:', event);
                this.contentEl.empty();
                this.contentEl.createEl('h2', { text: 'Error Loading Slides' });
                this.contentEl.createEl('p', { text: 'Could not load the slide preview. Make sure the local server is running and the URL is correct.' });
            });
        }
    }

    async onClose() {
        // Clean up resources if needed
    }
}

// The rest of the main.ts file follows...


const SERVER_PORT = 8765; // Define a port for our local server

// START: Content of HttpServer class moved from server.ts
export class HttpServer {
    private server: http.Server | null = null;
    private port: number;
    private slidesPath: string; // The base path for your slides

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
                    console.error(`Port ${this.port} is already in use.`);
                    reject(new Error(`Port ${this.port} is already in use.`));
                } else {
                    console.error('Server error:', e.message);
                    reject(e);
                }
            });
        });
    }

    stop(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.server) {
                this.server.close((err: any) => {
                    if (err) {
                        console.error('Error stopping server:', err.message);
                        reject(err);
                    } else {
                        console.log('Server stopped.');
                        resolve();
                    }
                });
            } else {
                resolve(); // No server to stop
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

        console.log(`[Slides Server] Request URL: ${req.url}`);
        console.log(`[Slides Server] Decoded URL: ${decodedUrl}`);
        console.log(`[Slides Server] Slides Path: ${this.slidesPath}`);

        let filePath = path.join(this.slidesPath, decodedUrl);
        console.log(`[Slides Server] Full File Path: ${filePath}`);

        // Prevent directory traversal
        if (!filePath.startsWith(this.slidesPath)) {
            res.statusCode = 403;
            res.end('Forbidden');
            return;
        }
        
        fs.readFile(filePath, (err: any, data: any) => {
            if (err) {
                console.error(`[Slides Server] Error reading file: ${err.message}`);
                if (err.code === 'ENOENT') {
                    res.statusCode = 404;
                    res.end('File not found.');
                } else {
                    res.statusCode = 500;
                    res.end(`Server error: ${err.message}`);
                }
                return;
            }

            // Determine content type
            const ext = path.extname(filePath).toLowerCase();
            let contentType = 'text/plain';
            switch (ext) {
                case '.html':
                    contentType = 'text/html';
                    break;
                case '.css':
                    contentType = 'text/css';
                    break;
                case '.js':
                    contentType = 'application/javascript';
                    break;
                case '.json':
                    contentType = 'application/json';
                    break;
                case '.png':
                    contentType = 'image/png';
                    break;
                case '.jpg':
                case '.jpeg':
                    contentType = 'image/jpeg';
                    break;
                case '.gif':
                    contentType = 'image/gif';
                    break;
                case '.svg':
                    contentType = 'image/svg+xml';
                    break;
            }

            res.setHeader('Content-Type', contentType);
            res.statusCode = 200;
            res.end(data);
        });
    }
    
    // Method to update slidesPath if settings change
    setSlidesPath(newPath: string) {
        this.slidesPath = newPath;
    }
}
// END: Content of HttpServer class

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
    private httpServer: HttpServer; // Add this line

    async onload() {
        await this.loadSettings();

        // Initialize and start the HTTP server
        const vaultBasePath = (this.app.vault.adapter as any).getBasePath();
        const absoluteSlidesPath = join(vaultBasePath, this.settings.slidesPath);
        this.httpServer = new HttpServer(SERVER_PORT, absoluteSlidesPath);
        try {
            await this.httpServer.start();
        } catch (e) {
            new Notice(`Failed to start local server: ${e.message}`);
            console.error('Failed to start local server:', e);
        }

        // --- Debounce Function ---
        let timeout: NodeJS.Timeout;
        this.debouncedGenerateSlides = (editor: Editor, view: MarkdownView) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                if (view.file) {
                    this.generateSlides(view.file, true);
                }
            }, 3000); // 3000ms delay
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

        // --- Settings Tab ---
        this.addSettingTab(new MarkdeepSlidesSettingTab(this.app, this));

        this.registerView(
            SLIDES_VIEW_TYPE,
            (leaf) => new SlidesView(leaf) // URL is now passed via ViewState
        );

        console.log('Markdeep Slides plugin loaded.');
    }

    onunload() {
        console.log('Markdeep Slides plugin unloaded.');
        if (this.httpServer) {
            this.httpServer.stop();
        }
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

        if (!htmlFile) {
            await this.generateSlides(activeFile, false);
        }

        const slideUrl = `http://localhost:${SERVER_PORT}/${activeFile.basename}.html`;
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

        if (!htmlFile) {
            await this.generateSlides(activeFile, false);
        }

        const slideUrl = `http://localhost:${SERVER_PORT}/${activeFile.basename}.html`;

        // Detach any existing slides views
        this.app.workspace.detachLeavesOfType(SLIDES_VIEW_TYPE);

        // Get a new leaf to the right
        const leaf = this.app.workspace.getLeaf('split', 'vertical');

        // Open the slides view in the new leaf
        await leaf.setViewState({
            type: SLIDES_VIEW_TYPE,
            active: true,
            state: { url: slideUrl } // Pass the URL to the view state
        });
        
        this.app.workspace.revealLeaf(leaf);

        new Notice(`Opening slides in a new pane.`);
    }
    
    // Removed getOpenCommand as it's no longer needed

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
            const fileContent = await this.app.vault.read(file);

            // Remove YAML frontmatter using a regular expression
            const frontmatterRegex = /^---\s*[\s\S]*?---\s*/;
            const content = fileContent.replace(frontmatterRegex, '');

            // Process HTML to insert meta charset and script
            let htmlToProcess = content;

            // Add meta charset to ensure proper display of Chinese characters
            const metaCharset = '<meta charset="utf-8">';
            // Insert meta charset before </head> if it exists
            if (htmlToProcess.includes('</head>')) {
                htmlToProcess = htmlToProcess.replace('</head>', `${metaCharset}\n</head>`);
            } else if (htmlToProcess.includes('<head>')) {
                // If <head> exists but not </head>, append to <head>
                htmlToProcess = htmlToProcess.replace('<head>', `<head>\n${metaCharset}`);
            } else {
                // If no head, just prepend it. This is less ideal but a fallback.
                // Assuming minimal HTML might start with <html> or even directly <body>
                htmlToProcess = `${metaCharset}\n${htmlToProcess}`;
            }

            // Append the SCRIPT_TO_APPEND
            // Assuming SCRIPT_TO_APPEND should be before </body> for best practice.
            // If the original HTML has a <body> tag, insert before </body>
            // Otherwise, append to the end.
            if (htmlToProcess.includes('</body>')) {
                htmlToProcess = htmlToProcess.replace('</body>', `${SCRIPT_TO_APPEND}\n</body>`);
            } else if (htmlToProcess.includes('<html>')) {
                // If <html> exists but not <body>, append to <html>
                htmlToProcess = htmlToProcess.replace('</html>', `${SCRIPT_TO_APPEND}\n</html>`);
            } else {
                htmlToProcess = htmlToProcess + SCRIPT_TO_APPEND;
            }

            const finalHtml = htmlToProcess; // This is the final HTML content

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

# Obsidian Markdeep Slides

这是一个为 [Obsidian](https://obsidian.md) 设计的插件，它利用 [Markdeep](https://casual-effects.com/markdeep/) 的强大功能，将您的 Markdown 笔记转换为功能丰富的 HTML 幻灯片。您可以在 Obsidian 中直接编辑笔记，并分栏实时预览生成的幻灯片效果。依赖的资源：请前往[wenbopeng/markdeep-slides-project](https://github.com/wenbopeng/markdeep-slides-project) 中获取解释器和主题。

https://github.com/user-attachments/assets/52670bdc-39aa-4d61-992d-f7d9d5d3ad4b

## ✨ 功能特性

- **✍️ Markdown 驱动**: 直接在您熟悉的 Markdown 编辑器中编写幻灯片内容。
- **👁️ 实时预览**: 在 Obsidian 内部分屏浏览幻灯片，您对 Markdown 的任何修改都会自动同步更新到预览视图中。
- **🌐 本地服务器**: 插件内置一个本地 HTTP 服务器，确保 Markdeep 脚本和相关资源能够正确加载和运行，提供完整的幻灯片体验。
- **🧭 状态保持**: 预览刷新后，插件会自动尝试恢复到您上次正在查看的幻灯片页码。
- **💻 外部浏览器支持**: 一键将当前幻灯片在您的默认浏览器中打开，方便演示或在更大屏幕上查看。
- **📂 文件系统集成**: 快速在系统文件管理器中定位到生成的 HTML 文件。
- **🏷️ 标签控制**: 只有在笔记的 `frontmatter` 中明确标记 `mdslides` 标签的笔记才会被处理，避免了对无关文件的干扰。
- **⚙️ 高度可配置**: 您可以自定义用于存放幻灯片文件的目录和本地服务器的端口号。

## 🚀 如何使用

#### 1. 前置准备：添加 Markdeep 脚本

为了让插件正常工作，您需要自行提供 Markdeep 的核心脚本。

1.  在您的 Obsidian 仓库（Vault）的根目录下，创建一个名为 `markdeep-slides` 的文件夹。
**特别提示**: 开发者对 Markdeep 的核心脚本进行了二次开发，优化了编辑体验并支持更多语法和呈现方式。请前往[wenbopeng/markdeep-slides-project](https://github.com/wenbopeng/markdeep-slides-project) 中获取解释器和主题, 他们存放于你下载的`markdeep-slides`文件夹中。
2.  默认地，解释器和主题文件夹，也就是`markdeep-slides`文件夹，您下载后请存放在Obsidian vault根目录下的`markdeep-slides`文件夹中， 当然，这个文件夹的路径你可以在插件设置项中自行定义。
3.  最终，您应该拥有这样一个文件路径：`<您的仓库路径>/markdeep-slides/markdeep-slides`，其中， `markdeep-slides`文件夹里面是解释器、主题文件和其他依赖文件。
4. 更多的语法和自定义设置，请前往[wenbopeng/markdeep-slides-project](https://github.com/wenbopeng/markdeep-slides-project) 了解

#### 2. 创建您的第一份幻灯片

1.  创建一个新的 Markdown 笔记，或者打开一个现有的笔记。
2.  在笔记的最顶端，添加 `frontmatter` 并包含 `mdslides` 标签。这是激活幻灯片功能的关键。

    ```yaml
    ---
    tags: [mdslides]
    ---
    ```

3.  开始编写您的幻灯片内容。在 Markdeep 中，使用三个或更多的短横线 (`---`) 来手动分隔每一页幻灯片。当然，我也默认开启了H1和H2标题自动分页，你可以自行关闭

    ```markdown
    # 幻灯片 1：标题

    这是第一页的内容。

    - 列表项 1
    - 列表项 2

    ---

    # 幻灯片 2：图片和图表

    您可以使用 Markdeep 的所有功能，例如插入图片和图表。

    ![your-image](your-image.png)
    ```

#### 3. 预览幻灯片

1.  确保光标在您想要预览的笔记中。
2.  打开命令面板 (`Cmd/Ctrl + P`)。
3.  输入并选择命令 **"Open Slides in Browser"** (在浏览器中打开幻灯片)。
4.  插件会在右侧打开一个新的面板，并加载渲染后的幻灯片。
5.  现在，当您在左侧编辑 Markdown 内容时，右侧的幻灯片预览将会在几秒后自动更新。

## 📖 命令列表

- **`Generate Markdeep Slides for current file`**:
  手动为当前笔记生成或更新 HTML 幻灯片文件。通常您不需要手动执行此操作，因为插件会自动处理。
- **`Open Slides in Browser`**:
  在 Obsidian 工作区内的一个新面板中打开当前笔记的幻灯片预览。这是最常用的命令。
- **`Open Slides in External Browser`**:
  在您的系统默认浏览器（如 Chrome, Safari）中打开幻灯片。
- **`Open Slides in File Explorer`**:
  在操作系统的文件管理器（如 Finder, Windows Explorer）中直接显示生成的 `.html` 文件。

## ⚙️ 工作原理解析

当您执行预览命令时，插件会执行以下操作：

1.  **检查标签**: 确认当前文件 `frontmatter` 中存在 `mdslides` 标签。
2.  **内容处理**: 读取您的 Markdown 文件内容，并移除 `frontmatter` 部分，以避免它显示在幻灯片中。
3.  **HTML 模板注入**: 将处理后的 Markdown 内容包装在一个基础的 HTML 结构中，并注入两个关键脚本：
    - 一个用于在页面重载时恢复幻灯片位置的内部脚本。
    - 指向您放置的 `markdeep-slides/slides-init.js` 的脚本引用。
4.  **生成文件**: 将最终的 HTML 字符串保存到您在设置中指定的输出目录中（默认为 `slides/`）。
5.  **启动服务**: 启动一个本地 Web 服务器，该服务器将您的仓库作为根目录，用于提供生成的 HTML 文件及相关资源（如图片）。
6.  **视图渲染**: 在 Obsidian 内打开一个特殊的视图（View），该视图内嵌一个 `<webview>`（类似 iframe），并将其指向本地服务器上的幻灯片地址（例如 `http://localhost:8765/slides/MyNote.html`）。
7.  **自动刷新**: 插件会持续监听编辑器内容的变化。当检测到变化时，它会自动重新执行步骤 2-4 来更新 HTML 文件。文件更新会触发预览视图的自动重载，从而实现实时预览。

## 🔧 插件设置

您可以在 `设置` -> `社区插件` -> `Markdeep Slides` 中找到以下选项：

- **Slides output path** (幻灯片输出路径)
  - 用于存放生成的 `.html` 幻灯片文件的文件夹路径。
  - 默认值: `slides`
- **Server port** (服务器端口)
  - 本地预览服务器使用的端口号。如果端口被占用，您可以在此修改。
  - **注意**: 修改此设置后需要重载 Obsidian 才能生效。
  - 默认值: `8765`

## 📦 安装

1.  从本插件的 [Release](https://github.com/your-repo/releases) 页面下载最新的 `main.js` 和 `manifest.json` 文件。
2.  在您的 Obsidian 仓库中，进入 `.obsidian/plugins/` 目录。
3.  创建一个新的文件夹，例如 `obsidian-markdeep-slides`。
4.  将下载的 `main.js` 和 `manifest.json` 文件复制到这个新创建的文件夹中。
5.  重启 Obsidian。
6.  在 `设置` -> `社区插件` 中，找到 "Markdeep Slides" 并启用它。

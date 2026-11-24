# Keyline

Keyline is a source fork of Code - OSS 1.147.0. Its editor, Explorer, terminal, search, source control, debugger, settings, themes, and extension host come from the VS Code workbench. The desktop and server-backed web workbenches start with the bundled Dark 2026 theme. [Upstream source at the fork point](https://github.com/microsoft/vscode/tree/8a14f0cc1b08d531eb83255ea3764ae22aa932b5)

## Try a guide

Open **Keyline** in the secondary sidebar, or run **Keyline: Open Agent** from the Command Palette. In a trusted workspace, choose **Describe a Change** for a model-backed guide or **Start a Practice Guide** for the included Taskboard exercises.

- Click the indicated file in Explorer. Review the green lines and the reason, then choose **Share Selected Lines**.
- The editor selects the proposed deletion in red. Replace it by hand. The hint at the caret shows one character, including spaces and line breaks. You can type your own implementation. Differences appear in red.
- Type `//DONE` on a separate line to save your actual edit and advance. The typing buffer is private to the guide. Auto Save and partial markers leave the source file intact until you finish.
- For file creation, use **New File** in Explorer and type the requested path. For a command, type it in the guided integrated terminal and press Enter to run your input. **Terminal → New Terminal** opens an ordinary interactive shell.

## Run the cloud workbench

Use Linux with Node 24 (see `.nvmrc`), Corepack, Python 3, curl, a C++ compiler, make, pkg-config and the Kerberos development headers. From the checkout root, run the following commands.

```sh
scripts/keyline-web-install.sh
scripts/keyline-web-build.sh
scripts/keyline-web.sh
```

Open the URL printed by the server. It listens on loopback port 5173 and uses Code - OSS connection tokens. The first launch copies Taskboard into `.keyline/taskboard`. Set `KEYLINE_WORKSPACE` to open your own folder and `KEYLINE_PORT` to choose another port. Local projects and server data live under the ignored `.keyline/` directory.

For open-ended requests, set `KEYLINE_MODEL_API_KEY` on the extension host. Configure `KEYLINE_MODEL` and `KEYLINE_MODEL_BASE_URL` when using another OpenAI-compatible chat-completions provider. The host also accepts `OPENAI_API_KEY`, `OPENAI_MODEL`, and `OPENAI_BASE_URL`. The planner receives workspace filenames and the results of steps that the learner performs. The practice guides work offline.

The native desktop source and upstream launchers are included. To develop the Electron desktop application, follow the upstream desktop build instructions, install the full dependencies with the pinned pnpm, and launch with `scripts/code.sh` or `scripts/code.bat`. The Extensions view uses Open VSX and supports installing VSIX files. Microsoft-hosted services and proprietary extensions have their own access and licensing requirements. [Desktop build prerequisites](https://github.com/microsoft/vscode/wiki/How-to-Contribute)

Run the focused Keyline tests with `node --test extensions/keyline/test/*.test.js`. With Chromium installed, run `CHROMIUM_PATH=/usr/bin/chromium node --test extensions/keyline/test/workbench.mjs` to exercise the real workbench in a temporary workspace. The source for the guided workflow is in `extensions/keyline`.

# Visual Studio Code - Open Source ("Code - OSS")
[![Feature Requests](https://img.shields.io/github/issues/microsoft/vscode/feature-request.svg)](https://github.com/microsoft/vscode/issues?q=is%3Aopen+is%3Aissue+label%3Afeature-request+sort%3Areactions-%2B1-desc)
[![Bugs](https://img.shields.io/github/issues/microsoft/vscode/bug.svg)](https://github.com/microsoft/vscode/issues?utf8=✓&q=is%3Aissue+is%3Aopen+label%3Abug)

## The Repository

This repository ("`Code - OSS`") is where we (Microsoft) develop the [Visual Studio Code](https://code.visualstudio.com) product together with the community. Not only do we work on code and issues here, but we also publish our [roadmap](https://github.com/microsoft/vscode/wiki/Roadmap), [monthly iteration plans](https://github.com/microsoft/vscode/wiki/Iteration-Plans), and our [endgame plans](https://github.com/microsoft/vscode/wiki/Running-the-Endgame). This source code is available to everyone under the standard [MIT license](https://github.com/microsoft/vscode/blob/main/LICENSE.txt).

## Visual Studio Code

<p align="center">
  <img alt="VS Code in action" src="https://github.com/user-attachments/assets/56af271c-949d-454c-a3ea-16188c063414">
</p>

[Visual Studio Code](https://code.visualstudio.com) is a distribution of the `Code - OSS` repository with Microsoft-specific customizations released under a traditional [Microsoft product license](https://code.visualstudio.com/License/).

[Visual Studio Code](https://code.visualstudio.com) combines the simplicity of a code editor with what developers need for their core edit-build-debug cycle. It provides comprehensive code editing, navigation, and understanding support along with lightweight debugging, a rich extensibility model, and lightweight integration with existing tools.

Visual Studio Code is updated monthly with new features and bug fixes. You can download it for Windows, macOS, and Linux on the [Visual Studio Code website](https://code.visualstudio.com/Download). To get the latest releases every day, install the [Insiders build](https://code.visualstudio.com/insiders).

## Contributing

There are many ways in which you can participate in this project, for example:

* [Submit bugs and feature requests](https://github.com/microsoft/vscode/issues), and help us verify them as they are checked in
* Review [source code changes](https://github.com/microsoft/vscode/pulls)
* Review the [documentation](https://github.com/microsoft/vscode-docs) and make pull requests for anything from typos to new content.

If you are interested in fixing issues and contributing directly to the codebase, please see the document [How to Contribute](https://github.com/microsoft/vscode/wiki/How-to-Contribute), which covers the following:

* [How to build and run from source](https://github.com/microsoft/vscode/wiki/How-to-Contribute)
* [The development workflow, including debugging and running tests](https://github.com/microsoft/vscode/wiki/How-to-Contribute#debugging)
* [Coding guidelines](https://github.com/microsoft/vscode/wiki/Coding-Guidelines)
* [Submitting pull requests](https://github.com/microsoft/vscode/wiki/How-to-Contribute#pull-requests)
* [Finding an issue to work on](https://github.com/microsoft/vscode/wiki/How-to-Contribute#where-to-contribute)
* [Contributing to translations](https://aka.ms/vscodeloc)

## Feedback

* Ask a question on [Stack Overflow](https://stackoverflow.com/questions/tagged/vscode)
* [Request a new feature](CONTRIBUTING.md)
* Upvote [popular feature requests](https://github.com/microsoft/vscode/issues?q=is%3Aopen+is%3Aissue+label%3Afeature-request+sort%3Areactions-%2B1-desc)
* [File an issue](https://github.com/microsoft/vscode/issues)
* Connect with the extension author community on [GitHub Discussions](https://github.com/microsoft/vscode-discussions/discussions) or [Slack](https://aka.ms/vscode-dev-community)
* Follow [@code](https://x.com/code) and let us know what you think!

See our [wiki](https://github.com/microsoft/vscode/wiki/Feedback-Channels) for a description of each of these channels and information on some other available community-driven channels.

## Related Projects

Many of the core components and extensions to VS Code live in their own repositories on GitHub. For example, the [node debug adapter](https://github.com/microsoft/vscode-node-debug) and the [mono debug adapter](https://github.com/microsoft/vscode-mono-debug) repositories are separate from each other. For a complete list, please visit the [Related Projects](https://github.com/microsoft/vscode/wiki/Related-Projects) page on our [wiki](https://github.com/microsoft/vscode/wiki).

## Bundled Extensions

VS Code includes a set of built-in extensions located in the [extensions](extensions) folder, including grammars and snippets for many languages. Extensions that provide rich language support (inline suggestions, Go to Definition) for a language have the suffix `language-features`. For example, the `json` extension provides coloring for `JSON` and the `json-language-features` extension provides rich language support for `JSON`.

## Development Container

This repository includes a Visual Studio Code Dev Containers / GitHub Codespaces development container.

* For [Dev Containers](https://aka.ms/vscode-remote/download/containers), use the **Dev Containers: Clone Repository in Container Volume...** command, which creates a Docker volume for better disk I/O on macOS and Windows.
  * If you already have VS Code and Docker installed, you can also click [here](https://vscode.dev/redirect?url=vscode://ms-vscode-remote.remote-containers/cloneInVolume?url=https://github.com/microsoft/vscode) to get started. This will cause VS Code to automatically install the Dev Containers extension if needed, clone the source code into a container volume, and spin up a dev container for use.

* For Codespaces, install the [GitHub Codespaces](https://marketplace.visualstudio.com/items?itemName=GitHub.codespaces) extension in VS Code, and use the **Codespaces: Create New Codespace** command.

Docker / the Codespace should have at least **4 cores and 6 GB of RAM (8 GB recommended)** to run a full build. See the [development container README](.devcontainer/README.md) for more information.

## Code of Conduct

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information, see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the [MIT](LICENSE.txt) license.

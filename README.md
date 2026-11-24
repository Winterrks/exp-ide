# Keyline

Keyline is a local browser IDE for learning to make code changes by hand. The agent proposes a read, edit, file creation, or terminal command and explains its purpose. The learner performs the action. Code and terminal suggestions reveal one character at a time.

## Run the IDE

Use Node.js 22.12 or newer, npm, and Bash on Linux or macOS.

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. The default port is 5173. On first launch Keyline copies the Taskboard sample to `.keyline/taskboard/`. Later launches reuse that copy. Both starter guides work offline once dependencies are installed.

The first guide fixes a counter that includes unfinished tasks.

1. Click the green `src/tasks.js` entry in Explorer. Review the highlighted lines and the agent’s reason, then choose **Continue**.
2. Press Backspace to remove the red selection. Type with the single-character hint, or write your own implementation. A red underline marks text that differs from the suggestion.
3. Finish the edit by typing `//DONE` on its own line. Keyline saves your text, consumes the marker, and gives the agent the actual result.
4. Select the green `tests` folder in Explorer and use **New file** to create the requested test. Type the test and finish it the same way.
5. Type the guided command in Terminal and press Enter. The command runs in the workspace and its output appears as it arrives.

The **+** button in the Agent panel opens the guide picker. Session activity shows the reads, edits, and command results the learner has shared. The current guide and unsaved text are retained in this browser. Regular file edits save with Ctrl+S or ⌘S.

## Connect a model or open your project

For open-ended requests, set `OPENAI_API_KEY` or `KEYLINE_MODEL_API_KEY` in the server environment or an ignored `.env.local` file. Restart Keyline and describe the change in the Agent panel. The default provider is OpenAI and the default model is `gpt-4.1-mini`. For an OpenAI-compatible service, set `OPENAI_BASE_URL` and `OPENAI_MODEL` to a Chat Completions endpoint base and a model that supports JSON responses. In a cloud environment with proxy-bound credentials, bind `KEYLINE_MODEL_API_KEY` to the provider’s HTTPS hostname.

```sh
KEYLINE_WORKSPACE=/absolute/path/to/project npm run dev
```

The server opens that directory in place. The model initially receives the goal and filenames. Subsequent requests include the line ranges the learner shared, the edits they saved, and output from guided terminal commands. Model proposals have no direct filesystem or shell execution path.

The terminal runs short, line-oriented Bash commands as the local user. Each submission starts a new Bash process and keeps the working directory for the next prompt. Interactive programs that need a TTY or stdin are outside this first version. Keyline’s filesystem and shell endpoints accept local browser connections on loopback.

## Verify

```sh
npm test
npm run build
npm run test:browser
```

The browser suite builds the app and exercises disposable workspaces in Chromium. It uses `/usr/bin/chromium` when available. Set `KEYLINE_CHROMIUM` to another Chromium executable or install the matching browser with `npx playwright-core install chromium`. The suite checks the offline guide and the model workflow against a local test provider.

Use `npm run preview` to serve the production build with the same local workspace API.

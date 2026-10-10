// Définitions des outils MCP exposés à chaque agent.
// Partagé entre le pont MCP (bridge.cjs) et le serveur (tools.js).

const str = (description) => ({ type: 'string', description });
const num = (description) => ({ type: 'number', description });
const bool = (description) => ({ type: 'boolean', description });
const obj = (properties, required = []) => ({ type: 'object', properties, required });

const PATH_HELP =
  'Instance path separated by "/", starting at a service. Example: "Workspace/Map/SpawnLocation" or "ServerScriptService/Main".';

const TOOLS = [
  // ---- Roblox Studio ----
  {
    name: 'studio_status',
    description: 'Check whether Roblox Studio is connected and which place is open.',
    inputSchema: obj({}),
  },
  {
    name: 'get_tree',
    description:
      'Show the instance hierarchy of the open place (names and classes). Use it to explore the game before editing.',
    inputSchema: obj({
      path: str(PATH_HELP + ' Empty = the whole game (main services).'),
      depth: num('How many levels to show (default 2, max 10).'),
      max: num('Maximum number of instances to list (default 400).'),
    }),
  },
  {
    name: 'get_instance',
    description:
      'Read one instance: class, common properties, attributes, children, and the full Source if it is a script.',
    inputSchema: obj({ path: str(PATH_HELP) }, ['path']),
  },
  {
    name: 'search',
    description: 'Find instances whose name (or script source) contains some text.',
    inputSchema: obj(
      {
        query: str('Text to look for (case-insensitive).'),
        class: str('Optional class filter, e.g. "BasePart", "Script".'),
        root: str('Optional path to search under. ' + PATH_HELP),
        in_source: bool('Also search inside script sources (default true).'),
      },
      ['query'],
    ),
  },
  {
    name: 'run_luau',
    description:
      'Run Luau code inside Roblox Studio (edit mode, plugin context) to build or change the place: create parts, maps, GUIs, lighting, etc. ' +
      'Use print() to report values; the output and the returned values come back to you. The change is one undo step in Studio. ' +
      'Prefer this for world building; prefer files in src/ for scripts.',
    inputSchema: obj({ code: str('Luau source to execute.') }, ['code']),
  },
  {
    name: 'create_instance',
    description: 'Create an instance with properties. Values: numbers, strings, booleans, [x,y,z] for Vector3, "#ff8800" or [r,g,b] for Color3, "Neon" for enums, a path for Instance references, [xs,xo,ys,yo] for UDim2.',
    inputSchema: obj(
      {
        parent: str('Parent path. ' + PATH_HELP),
        class: str('ClassName, e.g. "Part", "Model", "ScreenGui".'),
        name: str('Name of the new instance.'),
        properties: { type: 'object', description: 'Property name -> value.' },
      },
      ['parent', 'class'],
    ),
  },
  {
    name: 'set_properties',
    description: 'Change properties of an existing instance (same value formats as create_instance).',
    inputSchema: obj(
      {
        path: str(PATH_HELP),
        properties: { type: 'object', description: 'Property name -> value.' },
      },
      ['path', 'properties'],
    ),
  },
  {
    name: 'delete_instance',
    description: 'Delete an instance (undoable in Studio).',
    inputSchema: obj({ path: str(PATH_HELP) }, ['path']),
  },
  {
    name: 'set_script_source',
    description:
      'Create or replace a script. If file sync is on and the script lives in a synced service, the matching file in src/ is written instead (and pushed to Studio).',
    inputSchema: obj(
      {
        path: str(PATH_HELP + ' The last segment is the script name.'),
        source: str('Full Luau source.'),
        class: { type: 'string', enum: ['Script', 'LocalScript', 'ModuleScript'], description: 'Script class (guessed from the service if omitted).' },
      },
      ['path', 'source'],
    ),
  },
  {
    name: 'get_console',
    description: 'Read the latest messages from the Studio Output window (prints, warnings, errors), including during play tests.',
    inputSchema: obj({
      count: num('How many messages (default 60).'),
      only_errors: bool('Only warnings and errors.'),
    }),
  },
  {
    name: 'asset_search',
    description: 'Search the Roblox Creator Store (toolbox) for free models. Returns ids, names, creators and votes.',
    inputSchema: obj({ query: str('Keywords, e.g. "pine tree"'), limit: num('Max results (default 10).') }, ['query']),
  },
  {
    name: 'asset_insert',
    description: 'Insert a Creator Store asset into the place by id.',
    inputSchema: obj(
      {
        asset_id: num('Asset id from asset_search.'),
        parent: str('Parent path (default "Workspace").'),
        position: { type: 'array', items: { type: 'number' }, description: 'Optional [x,y,z] where to put it.' },
      },
      ['asset_id'],
    ),
  },
  {
    name: 'sync_files',
    description: 'Push every script file of src/ to Studio now (normally automatic).',
    inputSchema: obj({}),
  },
  {
    name: 'sync_status',
    description: 'State of the src/ <-> Studio synchronisation: files up to date, pending, failed, conflicts, syntax errors.',
    inputSchema: obj({}),
  },
  {
    name: 'check_scripts',
    description: 'Compile synced scripts with the Luau compiler inside Studio (syntax only, nothing is executed). Empty = all synced scripts.',
    inputSchema: obj({ paths: { type: 'array', items: { type: 'string' }, description: 'Instance paths like "ServerScriptService/Shop".' } }),
  },
  {
    name: 'validation_report',
    description:
      'Before saying a task is finished: report, per file, whether it is (1) written, (2) synced to Studio, (3) accepted by the Studio compiler, (4) free of recent errors in the Output. Play testing is never assumed.',
    inputSchema: obj({ files: { type: 'array', items: { type: 'string' }, description: 'Files like "src/ServerScriptService/Shop.server.luau". Empty = all tracked files.' } }),
  },
  {
    name: 'pull_scripts',
    description: 'Import every script of the open place into src/ (overwrites matching files).',
    inputSchema: obj({}),
  },

  // ---- Coordination entre agents ----
  {
    name: 'agents_status',
    description:
      'See the other AI agents working on this project: who they are, what they are doing, which files they reserved. Call it before starting a task.',
    inputSchema: obj({}),
  },
  {
    name: 'claim',
    description:
      'Reserve files or Studio instances for 10 minutes so other agents do not edit them at the same time. ' +
      'Files: paths relative to the project ("src/ServerScriptService/Shop.server.luau"). Studio: "studio:Workspace/Map". Fails if another agent holds one of them.',
    inputSchema: obj(
      {
        resources: { type: 'array', items: { type: 'string' }, description: 'What to reserve.' },
        note: str('What you are about to do (shown to the others).'),
      },
      ['resources'],
    ),
  },
  {
    name: 'release',
    description: 'Release reservations when you are done (all of yours if no list is given).',
    inputSchema: obj({ resources: { type: 'array', items: { type: 'string' } } }),
  },
  {
    name: 'board_read',
    description: 'Read the shared task board and the latest team messages.',
    inputSchema: obj({}),
  },
  {
    name: 'post_message',
    description: 'Post a message to the team channel (other agents and the user can read it).',
    inputSchema: obj({ text: str('Message.'), to: str('Optional: agent number like "#2", or "all".') }, ['text']),
  },
  {
    name: 'task_create',
    description: 'Add a task to the shared board (for yourself, another agent, or anyone).',
    inputSchema: obj(
      {
        title: str('Short title.'),
        details: str('What exactly has to be done.'),
        assignee: str('Optional agent number like "#2". The agent is notified automatically.'),
        acceptance: str('Acceptance criteria: how the creator will check it is done.'),
        depends_on: { type: 'array', items: { type: 'number' }, description: 'Ids of tasks that must be done first.' },
      },
      ['title'],
    ),
  },
  {
    name: 'task_update',
    description:
      'Update a task: take it (doing), mark it blocked, finish it (done -> goes to "review" when someone else created it; the creator validates with done), reassign it, add a note.',
    inputSchema: obj(
      {
        id: num('Task id.'),
        status: { type: 'string', enum: ['todo', 'doing', 'review', 'blocked', 'done'] },
        assignee: str('Agent number like "#2", "me", or "" to unassign.'),
        note: str('Optional note.'),
      },
      ['id'],
    ),
  },
];

module.exports = { TOOLS };

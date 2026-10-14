import type { HelpSection } from './types';

/** User guide (English). Same markup and section ids as content.ru.ts. */
export const HELP_EN: HelpSection[] = [
  {
    id: 'start',
    group: 'Basics',
    title: 'Getting started',
    icon: 'Rocket',
    body: `
Facet OS builds an information system for a student club. You describe **what** the club keeps track of (events, members, equipment, requests) and the program produces a ready system: a database, an admin panel and a portal for members. No programming required.

## How it works

- **Configuration** — the description of the club: sections, fields, relations, appearance, home page, plugins. You edit it in this program.
- **Portal** — the club website members see. The **Portal** tab always shows a live preview.
- **Server** — PocketBase with the database. It installs on any computer or VPS with one command, or runs right on this computer.

## First steps

1. Pick a template: **File → New club from template**. A template is a ready configuration (guild, esports, board games, media) you can adjust.
2. Select a section in the **Configuration** panel on the left and set up its fields in the **Properties** panel on the right. See [Sections and fields](#modules).
3. Fill in the initial data in the [data editor](#data) or [import it from Excel](#import).
4. Adjust the [appearance](#appearance) and the [home page](#dashboard).
5. Publish the system [to a server or on this computer](#publish).

> Everything is saved automatically in this browser or app. Any action can be undone with [[Ctrl+Z]] and redone with [[Ctrl+Shift+Z]].

## Editor modes

| Mode | What is available |
| --- | --- |
| Easy | Templates, name, logo, colours, viewing fields |
| Advanced | Editing sections, fields, relations, views, data import |
| Pro | System names of collections and fields, direct JSON editing |

Switch the mode on the toolbar or in **View → Editor mode**. Start with Easy — you can switch at any time, the configuration does not change.
`,
  },
  {
    id: 'interface',
    group: 'Basics',
    title: 'The interface',
    icon: 'LayoutPanelLeft',
    body: `
The window follows classic business software: menu and toolbar on top, the configuration tree on the left, the workspace in the middle, properties on the right and the status bar at the bottom.

## Main menu

- **File** — templates, opening and saving the schema, share link, export, backup, settings.
- **Edit** — undo and redo, creating and deleting sections, the list of all commands.
- **View** — workspace tabs, preview size, editor mode, app theme, language.
- **Data** — the [data editor](#data), [spreadsheet import](#import).
- **Plugins** — [plugin management](#plugins) and quick access to installed plugins.
- **Help** — this guide, keyboard shortcuts, welcome screen, about.

> Press [[Ctrl+K]] to open the **command palette**: start typing an action — for example “export” or “dark” — and press Enter.

## Configuration panel

A tree of all parts of the system: **Club**, **Appearance**, **Home page**, the list of **Sections** and the system nodes **Plugins** and **Publish**. Clicking a node opens its properties on the right. Right-clicking a section opens a context menu.

## Workspace

- **Portal** — live preview of the club website. The size (desktop, tablet, phone) is chosen above the preview.
- **Relations** — a diagram of sections and their relations. Drag the boxes; double-click opens section properties.
- **JSON** — the whole configuration file (for Pro mode).

Switch tabs with [[Ctrl+1]], [[Ctrl+2]], [[Ctrl+3]].

## Properties panel

Shows the settings of the selected node. The **?** icon in its header opens help for that page. Resize panels by dragging their border.

## Status bar

On the left — schema validation: a green check when all is well, or the number of errors (click to see the list). Then the number of sections and fields, the server version, the local server state, plugins, theme and language.
`,
  },
  {
    id: 'club',
    group: 'Configuration',
    title: 'Club and templates',
    icon: 'Flag',
    body: `
The **Club** node holds general information: the name, the motto (portal subtitle) and the portal language (Russian or English).

## Templates

A template is a ready club configuration with sections, fields, relations and appearance. Use **File → New club from template** or pick one in the club properties.

>! A template replaces the whole configuration. Changed your mind? [[Ctrl+Z]].

## Moving the configuration

- **File → Save schema to file** saves \`club-schema.json\`. Open it on another computer with **File → Open schema**.
- **File → Copy schema link** — a link with the structure and theme packed in (no data, no logo).
- **File → Editor backup** — everything at once: schema, draft data, plugins, server version history.
`,
  },
  {
    id: 'modules',
    group: 'Configuration',
    title: 'Sections and fields',
    icon: 'Boxes',
    body: `
A **section** is a database table and a portal page: “Events”, “Members”, “Equipment”. Each record of a section consists of **fields**.

## Creating a section

Click **Section** on the toolbar ([[Ctrl+Shift+M]]). Start from a section template (events, members, requests…), from scratch, or **from a spreadsheet** — fields are then derived from the file columns.

## Section properties

- **Name** in singular and plural — how the section is called on the portal.
- **Icon** — shown in the portal menu.
- **System name** (Pro mode) — the database collection name, in Latin letters.

## Fields

| Type | Used for | Example |
| --- | --- | --- |
| Text | Titles, descriptions, contacts | “Autumn cup” |
| Number | Quantities, prices, ratings | 12, 450.5 |
| Date | Date and time | 20.10.2026 18:30 |
| Select | One option from a list | “Online” / “Offline” |
| Status | Stage of work — drives the kanban | “Planned” → “Running” → “Done” |
| File | Images, documents | poster.png |
| Relation | Link to a record of another section | Organiser → Members |

The **first text field** is the record title: it is shown in cards, lists and relation pickers. A **required** field cannot be left empty — neither on the portal nor in the data editor.

> Renaming a field or section keeps the data: the server update renames the column instead of recreating it.
`,
  },
  {
    id: 'relations',
    group: 'Configuration',
    title: 'Relations',
    icon: 'Link2',
    body: `
A relation lets records of one section refer to records of another: an event has an organiser, a tournament has teams.

- **One record (one → many)** — each record links to one target record.
- **Many records (many ↔ many)** — a record links to any number of target records.

Add relations in the section properties, **Relations** block, or create a field of type “Relation”. On the portal, a record page shows linked records, and the target page shows the reverse list. All relations are visible on the **Relations** tab ([[Ctrl+2]]).
`,
  },
  {
    id: 'views',
    group: 'Configuration',
    title: 'Views',
    icon: 'LayoutGrid',
    body: `
A view is how a section looks on the portal. Choose it in the section properties, **View** block.

| View | Good for | Needs |
| --- | --- | --- |
| Cards | Posters, teams, catalogues | — |
| Table | Long lists, equipment | — |
| Kanban | Requests and tasks by stage | A Status or Select field |
| Calendar | Events, bookings | A Date field |

Every view has search, sorting and a record page. The **Portal tools** plugin adds CSV export and printing.
`,
  },
  {
    id: 'appearance',
    group: 'Configuration',
    title: 'Appearance',
    icon: 'Palette',
    body: `
The **Appearance** node sets the portal look: logo, palette, font, corner radius and density. Palettes are ready colour sets (plugins can add more); in Advanced mode each colour can be set separately. Changes appear in the preview immediately. The theme of the program itself is set in [settings](#settings).
`,
  },
  {
    id: 'dashboard',
    group: 'Configuration',
    title: 'Home page',
    icon: 'Home',
    body: `
The portal home page is a club overview. Enable it and choose blocks: **Stats** (record counts), **Upcoming** (future dated records), **Statuses** (records by status) and **Recent** (latest records). Reorder blocks with the arrows. If the home page is off, the portal opens on the first section.
`,
  },
  {
    id: 'data',
    group: 'Data',
    title: 'Data editor',
    icon: 'Table2',
    body: `
The data editor is a separate window with spreadsheet-like tables. Open it with **Data** on the toolbar, **Data → Data editor** ([[Ctrl+Shift+D]]) or from section properties.

## Data source

- **Draft** — initial data included in the export, so the system starts populated. Links are given by record titles.
- **Server** — the live database of the deployed system. Sign in as the PocketBase admin (address and email can be stored in [settings](#settings)). The password is not stored.
- **This computer** (desktop app) — the database of the locally running system. Sign-in is automatic.

## Working with the table

| Action | How |
| --- | --- |
| Move between cells | Arrows, Tab, Home/End, PageUp/PageDown |
| Edit a cell | Enter, F2, double-click or just start typing |
| Apply input | Enter (down) or Tab (right) |
| Cancel input | Esc |
| Select a range | Shift+arrows or drag with the mouse |
| Clear cells | Delete |
| New row | Insert or “+ Add row” at the bottom |
| Mark rows for deletion | Ctrl+Delete |
| Copy / paste | Ctrl+C / Ctrl+V |
| Save | Ctrl+S |
| Refresh | F5 |
| Search | Ctrl+F |

Click a column header to sort, again to reverse, a third time to clear. Drag a column's right edge to resize it. Right-click opens a context menu.

## Pasting from Excel and Google Sheets

Copy a range in Excel and press [[Ctrl+V]] in a cell. Values spread across columns from the current cell; missing rows are added. A single value pasted into a selected range fills the whole range.

## Changes and errors

Until you save, changes are only marked: green **+** — new row; pencil and yellow cell — changed value; red **×** and strike-through — row will be deleted; red corner — error (hover to see why). If the server rejects some rows, they stay in the table with an error, the rest are saved. **Discard** returns to the last saved state.

## Values by type

- **Date** — \`DD.MM.YYYY HH:MM\` or \`YYYY-MM-DD\`; the calendar button opens a picker.
- **Number** — spaces and a decimal comma are fine: “1 250,5”.
- **Select and status** — a list of options; start typing to filter.
- **Relation** — records of the linked section with search; for “many records” tick boxes and press Done ([[Ctrl+Enter]]).
- **File** — on a server, Enter opens a file picker and Delete removes the file. Not available in drafts.
`,
  },
  {
    id: 'accounting',
    group: 'Data',
    title: 'Accounting: operations and balances',
    icon: 'Wallet',
    body: `
Like accounting software, Facet OS has **lists** (members, equipment), **operations** (cash entries, equipment loans) and **balance registers** (cash, equipment on loan).

Use **Accounting → +** in the configuration for ready solutions: **Club cash** (income and expenses by category) and **Equipment loans** (who has what; you cannot return more than was issued).

A confirmed operation writes movements to registers: income as “+”, expense as “−”. The **Balances** page of the workspace shows the totals. Editing or deleting an operation recalculates balances; **Unconfirm** turns it into a draft.

>! With **Never below zero**, the server rejects an operation (or an edit or deletion) that would make a balance negative.

For your own register, set **dimensions** (what the balance is counted by) and **resources** (what is summed), then add posting rules to an operation section in **Section type**.
`,
  },
  {
    id: 'import',
    group: 'Data',
    title: 'Spreadsheet import',
    icon: 'FileSpreadsheet',
    body: `
**Data → Import from spreadsheet** ([[Ctrl+Shift+I]]):

1. Choose a CSV file or paste a Google Sheets link (shared with “Anyone with the link”).
2. Check how columns map to section fields; extra columns can become new fields.
3. Review the rows — errors are highlighted.
4. Import. Rows go to the **draft** and are loaded into the database on export.

When creating a section, choose **From spreadsheet** to derive fields from the columns. In the [data editor](#data) you can also paste cells from Excel or add rows from a CSV file.
`,
  },
  {
    id: 'roles',
    group: 'System',
    title: 'Roles & access',
    icon: 'ShieldCheck',
    body: `
Facet OS is the club team's internal system. Like an accounting system, it is used by staff (chair, treasurer, storekeeper, organizers), not by every member.

## Roles

**System → Roles & access** in the configuration. Ready roles: **Chair**, **Treasurer**, **Storekeeper**, **Organizer**. Rename them, add your own, delete any except the chair. **Manages staff** lets a role add people, assign roles and reset passwords.

## Permissions by section

Each matrix cell is a role's access to a section; a click cycles **no access → view → edit**. The **Default** row applies to sections without their own setting and to new sections. The same settings appear in section properties, **Access** block.

## Public sections

**Visible without sign-in** opens a section to guests (for example an event listing). Only roles with edit rights can still change it.

> Check permissions right in the preview: use **View as** above the portal.

>! After changing roles, export an update — permissions apply on the server once it is installed.
`,
  },
  {
    id: 'workspace',
    group: 'System',
    title: 'Team workspace',
    icon: 'Table2',
    body: `
The workspace is the club portal after signing in. Staff see only their role's sections and can add, edit and delete records where the role has edit rights.

The first sign-in is the chair with the admin email and password from \`.env\`; the chair then adds others on the **Staff** page (name, email, role, password), changes roles and resets passwords. Everyone changes their own password in **Profile** (click your name in the header).
`,
  },
  {
    id: 'plugins',
    group: 'System',
    title: 'Plugins',
    icon: 'Plug',
    body: `
Plugins add capabilities: notifications, auto-numbering, an audit log, portal tools. Open **Plugins → Manage plugins** ([[Ctrl+Shift+P]]).

| Plugin | What it does |
| --- | --- |
| Telegram notifications | Posts to a chat when records of chosen sections are created, changed or deleted |
| Auto-numbering | Gives records numbers like DOC-2026-00001 |
| Audit log | Adds an “Audit log” section: who changed what and when |
| Portal tools | “Export to CSV” and “Print” buttons on the portal |
| Custom CSS | Your own styles for the portal |

Required settings are marked; until they are filled in the plugin shows “Needs setup” and will not work on the server. **Secrets** (e.g. a bot token) are not stored in the schema or the share link — only in the server \`.env\` on export.

>! Plugins start working on the server after the next export — a new installation or an update.

**Install from file** accepts a plugin manifest (\`.json\`) and shows what the plugin can do before installing.

>! A third-party plugin runs code on the club server and in visitors' browsers. Only install plugins you trust.

See \`docs/PLUGINS.md\` in the repository to write your own.
`,
  },
  {
    id: 'publish',
    group: 'System',
    title: 'Publishing',
    icon: 'Server',
    body: `
## New server installation

**File → Export: new installation** ([[Ctrl+E]]) builds a zip with the full system.

1. Copy it to a Linux server and unpack.
2. Run \`sudo ./install.sh\` (with a domain: \`sudo ./install.sh club.example.org\` — HTTPS is set up automatically).
3. Open the address printed by the script and sign in to the workspace as the chair with the admin email and password from \`.env\`. Details are in \`DEPLOY.md\` inside the archive.

## Updates

**File → Export: server update** compares the current schema with the server version and lists the changes; dangerous ones (that delete data) are red and need confirmation. On the server, unpack the update over the system folder and run \`sudo ./apply-update.sh\`. A full backup is made first; roll back with \`./restore.sh backups/update-…\`.

> If the editor does not know the server version, upload \`club-schema.json\` from the server's system folder.

## On this computer

In the desktop app use **Publish → Run on this computer**. The server runs while the app is open; LAN access makes the portal reachable from phones on the same network.

## Backups

The server makes scheduled backups (configured in \`.env\`, optionally to S3). Manually: \`./backup.sh\`; restore: \`./restore.sh <backup folder>\`.
`,
  },
  {
    id: 'settings',
    group: 'System',
    title: 'Settings',
    icon: 'Settings',
    body: `
**File → Settings** ([[Ctrl+,]]) holds application preferences, saved automatically: **Interface** (theme, language, editor mode), **Editor** (delete confirmation, panels, welcome screen), **Connection** (club server address and admin email for the [data editor](#data)), **Data** (backup and restore, clearing drafts, full reset) and **About**.
`,
  },
  {
    id: 'shortcuts',
    group: 'Reference',
    title: 'Keyboard shortcuts',
    icon: 'Keyboard',
    body: `
## Main window

| Action | Keys |
| --- | --- |
| Command palette | Ctrl+K |
| Undo / redo | Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y) |
| New section | Ctrl+Shift+M |
| Open / save schema | Ctrl+O / Ctrl+S |
| Export new installation | Ctrl+E |
| Portal / relations / JSON | Ctrl+1 / Ctrl+2 / Ctrl+3 |
| Data editor | Ctrl+Shift+D |
| Spreadsheet import | Ctrl+Shift+I |
| Plugins | Ctrl+Shift+P |
| Settings | Ctrl+, |
| Help | F1 |

## Data editor

| Action | Keys |
| --- | --- |
| Move | Arrows, Tab, Shift+Tab, Home, End, PageUp, PageDown |
| Table start / end | Ctrl+Home / Ctrl+End |
| Edit cell | Enter, F2 or typing |
| Cancel input | Esc |
| Select all | Ctrl+A |
| Clear | Delete |
| New row | Insert |
| Mark for deletion | Ctrl+Delete |
| Copy / cut / paste | Ctrl+C / Ctrl+X / Ctrl+V |
| Save | Ctrl+S |
| Refresh | F5 |
| Search | Ctrl+F |

On macOS use Cmd instead of Ctrl.
`,
  },
  {
    id: 'faq',
    group: 'Reference',
    title: 'Troubleshooting',
    icon: 'LifeBuoy',
    body: `
### Where is my configuration stored?

In this browser or app (automatically). Make an **Editor backup** or save the schema to a file now and then.

### The status bar shows errors

Click the error count to see the list — usually a section without fields, a relation to a deleted section or a kanban without a status field.

### The data editor says the section is not on the server

The server structure is behind. Export an update, apply it with \`apply-update.sh\` and refresh ([[F5]]).

### Cannot connect to the server

Check the address (with \`https://\` or \`http://\` and port), that the system is running, and the admin email/password from the server \`.env\`.

### A plugin does nothing

Make sure it is enabled and not marked “Needs setup”, then export and apply an update — plugins run on the server only.
`,
  },
];

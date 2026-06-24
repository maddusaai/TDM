# TDM Prototype — Feature Updates

---

- When an admin opens a workspace, a second sidebar slides in beside the main sidebar. The main sidebar collapses to icons to make room. The second sidebar shows workspace-specific navigation — the same one developers see in their workspace view.

- Clicking any workspace row in the Workspaces table now navigates directly into that workspace's view.

- The "Create Workspace" flow is now a 3-step guided modal:
  - **Step 1** — Enter basic workspace details (name, owner, description, environment).
  - **Step 2** — Select which source connectors this workspace should have access to. A new connector can also be created inline here without leaving the modal.
  - **Step 3** — Optionally assign org members to the workspace. This step can be skipped.

- Any connector added during workspace creation automatically appears in the Source Connections page.

- After creating a workspace, the user is taken back to the Workspaces list where the new workspace is immediately visible.

- Clicking "My Workspaces" on the Dashboard navigates to the Workspaces tab.

- The Source Connections page now shows a reference card with 3 test connectors (with ready-to-use connection strings) to make it easier to set up demo connections quickly.

- Each workspace's Connectors tab shows only the connectors assigned to that workspace, along with a preview of the tables and sample data available through each connector.

- The Create Pipeline page has been simplified. The source selection step now lets the user pick a connector and choose which tables to include, instead of requiring sandbox setup and Databricks configuration. The page no longer includes CSV upload or sandbox management.

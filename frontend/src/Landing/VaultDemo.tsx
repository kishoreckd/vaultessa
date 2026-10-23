import { useState } from "react";
import {
  Check,
  Folder,
  LayoutGrid,
  LockKeyhole,
  Search,
  Settings,
  Users,
  X,
} from "lucide-react";
import { VaultessaLogo } from "@/components/common/brand";

type DemoItem = {
  name: string;
  username: string;
  type: string;
  folder: string;
  shared?: boolean;
};
export const sampleVaultItems: DemoItem[] = [
  {
    name: "Google",
    username: "sarah@example.com",
    type: "Logins",
    folder: "Personal",
  },
  {
    name: "Notion",
    username: "sarah@example.com",
    type: "Logins",
    folder: "Work",
    shared: true,
  },
  {
    name: "Spotify",
    username: "sarah@example.com",
    type: "Logins",
    folder: "Personal",
  },
  {
    name: "GitHub",
    username: "sarah-dev",
    type: "Logins",
    folder: "Work",
    shared: true,
  },
  {
    name: "Airbnb",
    username: "sarah@example.com",
    type: "Logins",
    folder: "Travel",
  },
  {
    name: "Travel checklist",
    username: "Passport, tickets, chargers",
    type: "Secure notes",
    folder: "Travel",
  },
  {
    name: "Example card",
    username: "Demo card · ending 4242",
    type: "Cards",
    folder: "Personal",
  },
  {
    name: "Personal profile",
    username: "Sarah Chen · fictional profile",
    type: "Identities",
    folder: "Personal",
  },
];
export function filterDemoItems(
  items: DemoItem[],
  search: string,
  category = "All items",
  folder: string | null = null,
  shared = false,
) {
  return items.filter(
    (item) =>
      (category === "All items" || item.type === category) &&
      (!folder || item.folder === folder) &&
      (!shared || item.shared) &&
      `${item.name} ${item.username} ${item.folder}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
}

export function VaultDemo() {
  const [view, setView] = useState("All items");
  const [category, setCategory] = useState("All items");
  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const [items, setItems] = useState(sampleVaultItems);
  const [selected, setSelected] = useState<DemoItem | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [autoLock, setAutoLock] = useState("5 minutes");
  const [notifications, setNotifications] = useState(true);
  const [message, setMessage] = useState("");
  const rows = filterDemoItems(
    items,
    search,
    category,
    folder,
    view === "Shared",
  );
  function navigate(next: string) {
    setView(next);
    setFolder(null);
    setSelected(null);
    setAdding(false);
    setSearch("");
    setCategory("All items");
    setMessage("");
  }
  return (
    <div
      className="vault-preview"
      aria-label="Interactive vault preview with fictional sample data"
    >
      <aside className="preview-sidebar">
        <VaultessaLogo />
        <nav className="preview-nav" aria-label="Demo navigation">
          {[
            { name: "All items", icon: LayoutGrid },
            { name: "Folders", icon: Folder },
            { name: "Shared", icon: Users },
            { name: "Settings", icon: Settings },
          ].map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={view === name ? "selected" : ""}
              aria-pressed={view === name}
              onClick={() => navigate(name)}
            >
              <Icon size={15} />
              {name}
            </button>
          ))}
        </nav>
      </aside>
      <div className="preview-main">
        <div className="demo-heading">
          <span>Interactive demo · fictional data</span>
          <button
            onClick={() => {
              setItems(sampleVaultItems);
              navigate("All items");
              setAutoLock("5 minutes");
              setNotifications(true);
            }}
          >
            Reset demo
          </button>
        </div>
        {view !== "Settings" && (
          <div className="preview-toolbar">
            <label>
              <Search size={15} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your vault…"
                aria-label="Search sample vault"
              />
            </label>
            <button
              className="demo-add"
              onClick={() => {
                setAdding(!adding);
                setSelected(null);
              }}
            >
              ＋ Add item
            </button>
          </div>
        )}
        {adding && (
          <form
            className="demo-panel"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return;
              setItems([
                ...items,
                {
                  name: name.trim(),
                  username: "demo@example.com",
                  type: "Logins",
                  folder: folder ?? "Personal",
                },
              ]);
              setName("");
              setAdding(false);
              setView("All items");
              setCategory("All items");
              setSearch("");
              setMessage("Sample item added for this demo only.");
            }}
          >
            <label>
              Sample item name
              <input
                required
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Example login"
              />
            </label>
            <p>
              Use a fictional name. This demo does not save real credentials.
            </p>
            <button type="submit">Add sample</button>
            <button type="button" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </form>
        )}
        {view === "Settings" ? (
          <section className="demo-settings">
            <h3>Settings preview</h3>
            <p>Explore preferences without changing your account.</p>
            <label>
              Auto-lock interval
              <select
                value={autoLock}
                onChange={(e) => {
                  setAutoLock(e.target.value);
                  setMessage("Demo preference updated.");
                }}
              >
                {["1 minute", "5 minutes", "15 minutes"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="demo-toggle">
              <input
                type="checkbox"
                checked={notifications}
                onChange={(e) => {
                  setNotifications(e.target.checked);
                  setMessage("Demo preference updated.");
                }}
              />
              Security notification preference
            </label>
            <div className="demo-setting-note">
              <LockKeyhole size={20} />
              <p>
                In your real vault, Settings also includes account security,
                sessions, notifications and recovery. These controls only
                demonstrate preference changes; they do not enable notifications
                or lock this demo.
              </p>
            </div>
          </section>
        ) : (
          <>
            {view === "Folders" && (
              <div className="demo-folders">
                <h3>Organise with folders</h3>
                <div>
                  {["Personal", "Work", "Travel"].map((entry) => (
                    <button
                      key={entry}
                      aria-pressed={folder === entry}
                      onClick={() => {
                        setFolder(folder === entry ? null : entry);
                        setSelected(null);
                      }}
                    >
                      <Folder size={20} />
                      <strong>{entry}</strong>
                      <span>
                        {items.filter((item) => item.folder === entry).length}{" "}
                        items
                      </span>
                    </button>
                  ))}
                </div>
                {folder && (
                  <p>
                    Showing {folder}. Select the folder again to see all items.
                  </p>
                )}
              </div>
            )}
            {view === "Shared" && (
              <div className="demo-shared">
                <h3>Shared with your team</h3>
                <p>
                  Sample shared items. Select one to explore its demo access
                  controls.
                </p>
              </div>
            )}
            <div
              className="preview-tabs"
              role="group"
              aria-label="Preview item type"
            >
              {[
                "All items",
                "Logins",
                "Secure notes",
                "Cards",
                "Identities",
              ].map((entry) => (
                <button
                  key={entry}
                  className={category === entry ? "active" : ""}
                  aria-pressed={category === entry}
                  onClick={() => {
                    setCategory(entry);
                    setSelected(null);
                  }}
                >
                  {entry}
                </button>
              ))}
            </div>
            {selected ? (
              <section className="demo-panel">
                <button
                  className="demo-close"
                  aria-label="Close sample item"
                  onClick={() => setSelected(null)}
                >
                  <X size={16} />
                </button>
                <h3>{selected.name}</h3>
                <p>
                  {selected.type} · {selected.folder}
                </p>
                <dl>
                  <dt>
                    {selected.type === "Logins" ? "Username" : "Sample content"}
                  </dt>
                  <dd>{selected.username}</dd>
                  {selected.type === "Logins" && (
                    <>
                      <dt>Example password</dt>
                      <dd>
                        <code>
                          {revealed ? "Demo-only!123" : "••••••••••••"}
                        </code>
                        <button onClick={() => setRevealed(!revealed)}>
                          {revealed ? "Hide" : "Reveal"}
                        </button>
                      </dd>
                    </>
                  )}
                </dl>
                {selected.shared && (
                  <label>
                    Demo permission
                    <select
                      defaultValue="View"
                      onChange={() =>
                        setMessage(
                          "Sample sharing permission changed. No real access was modified.",
                        )
                      }
                    >
                      <option>View</option>
                      <option>Edit</option>
                    </select>
                  </label>
                )}
                <p>
                  Fictional sample data. Nothing is connected to an account.
                </p>
              </section>
            ) : (
              <div className="preview-table">
                <div className="preview-table-head">
                  <span>Name ↑</span>
                  <span>Username / detail</span>
                  <span>Type</span>
                  <span>Folder</span>
                </div>
                {rows.map((item) => (
                  <button
                    className="preview-row demo-item-row"
                    key={`${item.name}-${items.indexOf(item)}`}
                    onClick={() => {
                      setSelected(item);
                      setRevealed(false);
                    }}
                  >
                    <span className="preview-name">
                      <b>{item.name.slice(0, 1)}</b>
                      <span>
                        <strong>{item.name}</strong>
                        <small>
                          {item.shared ? "Shared with team" : item.folder}
                        </small>
                      </span>
                    </span>
                    <span className="preview-email">{item.username}</span>
                    <span>
                      {item.type === "Logins" ? "••••••••" : item.type}
                    </span>
                    <span className="preview-time">{item.folder}</span>
                  </button>
                ))}
                {!rows.length && (
                  <p className="preview-empty">
                    No sample items match. Try another category or search.
                  </p>
                )}
              </div>
            )}
          </>
        )}
        <p className="demo-status" role="status">
          {message && (
            <>
              <Check size={13} />
              {message}
            </>
          )}
        </p>
      </div>
    </div>
  );
}

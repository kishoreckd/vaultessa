import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ExternalLink,
  FolderPlus,
  Folder as FolderIcon,
  KeyRound,
  Link2,
  Plus,
  Search,
  Star,
  Trash2,
  TriangleAlert,
  User,
  Users,
  Vault,
  type LucideIcon,
} from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { confirmAction } from "@/components/common/confirm-dialog";
import { IconAction } from "@/components/common/icon-action";
import { EmptyState, Kbd, Loading } from "@/components/common/page";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useClipboard } from "@/hooks/useClipboard";
import { useHotkeys } from "@/hooks/useHotkeys";
import { SECRET_TYPES, type SecretType } from "@/api/vault/types";
import { cn } from "@/lib/utils";
import { analyzeHealth } from "../security/passwordHealth";
import { summarizeLinks, useExternalShares } from "../shares/hooks";
import { GettingStarted } from "./GettingStarted";
import {
  useAcceptPendingShares,
  useCreateFolder,
  useDeleteFolder,
  useFolders,
  useVaultItems,
} from "./hooks";
import { ItemAvatar } from "./ItemAvatar";
import { SecretDetail } from "./SecretDetail";
import { SecretEditorDrawer } from "./SecretEditor";
import { getField, TEMPLATES } from "./secretTemplates";
import { SharingFlags } from "./SharingFlags";
import { VaultTypeFilter, type VaultCategory } from './VaultTypeFilter';
import { can, safeHref, type DecryptedItem } from "./vaultTypes";

type Filter =
  | { kind: "all" }
  | { kind: "favorites" }
  | { kind: "shared" }
  | { kind: "type"; type: SecretType }
  | { kind: "folder"; id: string };

const filterKey = (f: Filter) => JSON.stringify(f);

function matchesFilter(item: DecryptedItem, filter: Filter) {
  switch (filter.kind) {
    case "all":
      return true;
    case "favorites":
      return item.favorite;
    case "shared":
      return !item.isOwner;
    case "type":
      return item.type === filter.type;
    case "folder":
      return item.folderId === filter.id;
  }
}

const subtitle = (item: DecryptedItem) =>
  TEMPLATES[item.type].subtitle(item.data) ?? TEMPLATES[item.type].label;

function matchesSearch(item: DecryptedItem, query: string) {
  if (!query) return true;
  const q = query.toLowerCase();
  return [
    item.data.name,
    item.data.username,
    item.data.url,
    subtitle(item),
    item.owner.name,
  ].some((v) => v?.toLowerCase().includes(q));
}

type EditorState = { open: boolean; item?: DecryptedItem; type?: SecretType };

export function VaultPage() {
  const items = useVaultItems();
  const folders = useFolders();
  const createFolder = useCreateFolder();
  const deleteFolder = useDeleteFolder();
  const copy = useClipboard();
  useAcceptPendingShares(items.data);

  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [category, setCategory] = useState<VaultCategory>('ALL');
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>({ open: false });
  const [newFolder, setNewFolder] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const all = useMemo(() => items.data ?? [], [items.data]);
  const health = useMemo(() => analyzeHealth(all), [all]);
  const links = useExternalShares();
  const linkInsights = useMemo(() => summarizeLinks(links.data), [links.data]);
  const visible = useMemo(
    () =>
      all
        .filter((i) => matchesFilter(i, filter) &&
          (filter.kind === 'type' || category === 'ALL' || i.type === category) && matchesSearch(i, search))
        .sort(
          (a, b) =>
            Number(b.favorite) - Number(a.favorite) ||
            a.data.name.localeCompare(b.data.name),
        ),
    [all, filter, category, search],
  );
  const selected = all.find((i) => i.id === selectedId) ?? null;
  const folderName = (id: string | null) =>
    folders.data?.find((f) => f.id === id)?.name ?? null;
  const typesPresent = SECRET_TYPES.filter((t) =>
    all.some((i) => i.type === t),
  );

  const openNew = (type?: SecretType) =>
    setEditor({
      open: true,
      type: type ?? (filter.kind === "type" ? filter.type : category !== 'ALL' ? category : "LOGIN"),
    });

  // Deep link from other pages (e.g. Shared links): /?item=<id> opens that item, then cleans the URL.
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedId = searchParams.get("item");
  const sharedOnly = searchParams.get("view") === "shared";
  useEffect(() => {
    if (!sharedOnly) return;
    setFilter({ kind: "shared" });
    setCategory('ALL');
    setSearch("");
  }, [sharedOnly]);
  useEffect(() => {
    if (!linkedId || !items.data) return;
    if (all.some((i) => i.id === linkedId)) {
      setFilter({ kind: "all" });
      setCategory('ALL');
      setSearch("");
      setSelectedId(linkedId);
    } else {
      toast.info("That item isn’t in your vault any more.");
    }
    setSearchParams({}, { replace: true });
  }, [linkedId, items.data, all, setSearchParams]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-id="${selectedId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  function move(delta: number) {
    if (!visible.length) return;
    const index = visible.findIndex((i) => i.id === selectedId);
    const next =
      index === -1
        ? delta > 0
          ? 0
          : visible.length - 1
        : Math.min(Math.max(index + delta, 0), visible.length - 1);
    setSelectedId(visible[next]!.id);
  }

  function copyField(item: DecryptedItem | null, key: "password" | "username") {
    if (!item || item.decryptFailed) return;
    const value = getField(item.data, key);
    if (!value) return toast.info(`“${item.data.name}” has no ${key}`);
    if (key === "password" && !can(item, "VIEW"))
      return toast.info("You have login-only access to this password");
    void copy(value, key === "password" ? "Password" : "Username");
  }

  useHotkeys({
    "/": () => searchRef.current?.focus(),
    n: () => openNew(),
    ArrowDown: () => move(1),
    j: () => move(1),
    ArrowUp: () => move(-1),
    k: () => move(-1),
    c: () => copyField(selected, "password"),
    u: () => copyField(selected, "username"),
    e: () =>
      selected &&
      can(selected, "MODIFY") &&
      setEditor({ open: true, item: selected }),
    Escape: () => {
      if (document.activeElement === searchRef.current) {
        setSearch("");
        searchRef.current?.blur();
      } else setSelectedId(null);
    },
  });

  async function onCreateFolder(event: FormEvent) {
    event.preventDefault();
    const name = newFolder.trim();
    if (!name) return;
    await createFolder.mutateAsync(name);
    toast.success(`Folder “${name}” created`);
    setNewFolder("");
  }

  async function onDeleteFolder(id: string, name: string) {
    const ok = await confirmAction({
      title: `Delete folder “${name}”?`,
      description: "Items inside are kept and move to “All items”.",
      confirmLabel: "Delete folder",
      destructive: true,
    });
    if (!ok) return;
    await deleteFolder.mutateAsync(id);
    setFilter({ kind: "all" });
    toast.success(`Folder “${name}” deleted`);
  }

  const editorDrawer = (
    <SecretEditorDrawer
      open={editor.open}
      onOpenChange={(open) => setEditor((s) => ({ ...s, open }))}
      existing={editor.item}
      defaultType={editor.type}
      folders={folders.data ?? []}
      defaultFolderId={filter.kind === "folder" ? filter.id : null}
      onSaved={setSelectedId}
    />
  );

  if (items.isLoading)
    return <Loading label="Decrypting your vault on this device…" />;
  if (items.error) {
    return (
      <Alert variant="destructive">
        <TriangleAlert />
        <AlertDescription>
          Could not load your vault. Check your connection and reload.
        </AlertDescription>
      </Alert>
    );
  }
  if (all.length === 0) {
    return (
      <div className="mx-auto h-full max-w-3xl overflow-y-auto">
        <GettingStarted onAdd={openNew} />
        {editorDrawer}
      </div>
    );
  }

  const navItem = (
    label: string,
    f: Filter,
    count: number,
    Icon: LucideIcon,
    trailing?: ReactNode,
  ) => {
    const active = filterKey(f) === filterKey(filter);
    return (
      <div key={filterKey(f)} className="group/nav flex items-center">
        <Button
          variant={active ? "secondary" : "ghost"}
          aria-current={active ? "page" : undefined}
          onClick={() => { setFilter(f); setCategory(f.kind === 'type' ? f.type : 'ALL'); }}
          className={cn(
            "h-8 w-full justify-start font-normal",
            active && "font-medium",
          )}
        >
          <Icon className="text-muted-foreground" />
          <span className="flex-1 truncate text-left">{label}</span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {count}
          </span>
        </Button>
        {trailing}
      </div>
    );
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)] gap-6 lg:grid-cols-[14rem_minmax(0,1fr)_26rem]">
      {/* Sidebar (desktop) */}
      <aside
        className="hidden min-h-0 gap-6 overflow-y-auto overscroll-contain lg:grid lg:content-start"
        aria-label="Vault navigation"
      >
        <nav className="grid gap-0.5">
          {navItem("All items", { kind: "all" }, all.length, Vault)}
          {navItem(
            "Favourites",
            { kind: "favorites" },
            all.filter((i) => i.favorite).length,
            Star,
          )}
          {navItem(
            "Shared with me",
            { kind: "shared" },
            all.filter((i) => !i.isOwner).length,
            Users,
          )}
          <Button
            variant="ghost"
            asChild
            className="h-8 justify-start font-normal"
          >
            <Link to="/links">
              <Link2 className="text-muted-foreground" /> Shared links
            </Link>
          </Button>
        </nav>
        {typesPresent.length > 1 && (
          <div className="grid gap-1">
            <h2 className="px-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Types
            </h2>
            <div className="grid gap-0.5">
              {typesPresent.map((t) =>
                navItem(
                  TEMPLATES[t].label,
                  { kind: "type", type: t },
                  all.filter((i) => i.type === t).length,
                  TEMPLATES[t].icon,
                ),
              )}
            </div>
          </div>
        )}
        <div className="grid gap-1">
          <h2 className="px-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Folders
          </h2>
          <div className="grid gap-0.5">
            {folders.data?.map((f) =>
              navItem(
                f.name,
                { kind: "folder", id: f.id },
                all.filter((i) => i.folderId === f.id).length,
                FolderIcon,
                <IconAction
                  label={`Delete folder ${f.name}`}
                  className="opacity-0 group-hover/nav:opacity-100 focus-visible:opacity-100"
                  onClick={() => onDeleteFolder(f.id, f.name)}
                >
                  <Trash2 />
                </IconAction>,
              ),
            )}
          </div>
          <form onSubmit={onCreateFolder} className="mt-1 flex gap-1">
            <Input
              aria-label="New folder name"
              placeholder="New folder"
              className="h-8"
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
            />
            <IconAction
              label="Create folder"
              type="submit"
              variant="outline"
              size="icon"
            >
              <FolderPlus />
            </IconAction>
          </form>
        </div>
      </aside>

      {/* List */}
      <section
        className={cn(
          "flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden",
          selected && "hidden lg:flex",
        )}
        aria-label="Items"
      >
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              type="search"
              aria-label="Search vault"
              placeholder="Search name, username, website…"
              className="h-9 pl-8 pr-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  e.currentTarget.blur();
                  move(1);
                }
              }}
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 sm:block">
              <Kbd>/</Kbd>
            </span>
          </div>
          <Button size="lg" onClick={() => openNew()}>
            <Plus /> <span className="hidden sm:inline">New item</span>
          </Button>
        </div>

        {/* Filter (mobile) */}
        <Select
          value={filterKey(filter)}
          onValueChange={(v) => { const next = JSON.parse(v) as Filter; setFilter(next); setCategory(next.kind === 'type' ? next.type : 'ALL'); }}
        >
          <SelectTrigger aria-label="Show" className="w-full lg:hidden">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={filterKey({ kind: "all" })}>
              All items ({all.length})
            </SelectItem>
            <SelectItem value={filterKey({ kind: "favorites" })}>
              Favourites
            </SelectItem>
            <SelectItem value={filterKey({ kind: "shared" })}>
              Shared with me
            </SelectItem>
            {typesPresent.length > 0 && <SelectSeparator />}
            {typesPresent.map((t) => (
              <SelectItem key={t} value={filterKey({ kind: "type", type: t })}>
                {TEMPLATES[t].label}
              </SelectItem>
            ))}
            {!!folders.data?.length && <SelectSeparator />}
            {folders.data?.map((f) => (
              <SelectItem
                key={f.id}
                value={filterKey({ kind: "folder", id: f.id })}
              >
                Folder: {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <VaultTypeFilter value={filter.kind === 'type' ? filter.type : category} typesPresent={typesPresent} onChange={(next) => {
          setCategory(next);
          if (filter.kind === 'type') setFilter({kind:'all'});
          setSelectedId(null);
        }}/>

        <p className="shrink-0 text-xs text-muted-foreground" aria-live="polite">
          {visible.length} {visible.length === 1 ? "item" : "items"}
          {search && ` matching “${search}”`}
        </p>

        {visible.length === 0 ? (
          <EmptyState
            icon={<Search />}
            title="Nothing here"
            description={
              search ? "Try a different search." : "Add an item to this view."
            }
            action={
              <div className="flex gap-2">
                {search && (
                  <Button variant="outline" onClick={() => setSearch("")}>
                    Clear search
                  </Button>
                )}
                <Button onClick={() => openNew()}>
                  <Plus /> New item
                </Button>
              </div>
            }
          />
        ) : (
          <Card className="min-h-0 flex-1 gap-0 overflow-hidden py-0">
            <ul
              ref={listRef}
              className="min-h-0 flex-1 divide-y overflow-y-auto overscroll-contain"
              tabIndex={0}
              aria-label="Scrollable vault items"
            >
              {visible.map((item) => {
                const isSelected = item.id === selectedId;
                const atRisk =
                  (health.byId.get(item.id)?.issues.length ?? 0) > 0;
                const href = safeHref(item.data.url);
                return (
                  <li
                    key={item.id}
                    data-id={item.id}
                    className={cn(
                      "group flex items-center gap-1 pr-2 transition-colors",
                      isSelected ? "bg-accent" : "hover:bg-muted/50",
                    )}
                  >
                    <button
                      type="button"
                      aria-current={isSelected ? "true" : undefined}
                      onClick={() => setSelectedId(item.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
                    >
                      <ItemAvatar type={item.type} name={item.data.name} />
                      <span className="grid min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "truncate text-sm font-medium",
                              item.decryptFailed && "text-destructive",
                            )}
                          >
                            {item.data.name}
                          </span>
                          {item.favorite && (
                            <Star
                              className="size-3.5 shrink-0 fill-amber-400 text-amber-400"
                              aria-label="Favourite"
                            />
                          )}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {!item.isOwner && (
                            <span className="text-sky-600 dark:text-sky-400">
                              Shared by {item.owner.name} ·{" "}
                            </span>
                          )}
                          {subtitle(item)}
                        </span>
                      </span>
                      <SharingFlags
                        item={item}
                        links={linkInsights.get(item.id)}
                      />
                      {atRisk && (
                        <Badge
                          variant="outline"
                          className="hidden border-warning/50 text-warning sm:inline-flex"
                        >
                          <TriangleAlert /> At risk
                        </Badge>
                      )}
                    </button>
                    {/* Quick actions: copy without opening the item. */}
                    <div className="flex shrink-0 items-center lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
                      {item.data.username && (
                        <IconAction
                          label="Copy username"
                          onClick={() => copyField(item, "username")}
                        >
                          <User />
                        </IconAction>
                      )}
                      {item.data.password && can(item, "VIEW") && (
                        <IconAction
                          label="Copy password"
                          onClick={() => copyField(item, "password")}
                        >
                          <KeyRound />
                        </IconAction>
                      )}
                      {href && (
                        <IconAction label="Open website" asChild>
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink />
                          </a>
                        </IconAction>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>

      {/* Detail */}
      <section
        className={cn(
          "min-h-0 min-w-0 overflow-y-auto overscroll-contain",
          !selected && "hidden lg:block",
        )}
        aria-label="Item details"
      >
        {selected ? (
          <SecretDetail
            key={selected.id}
            item={selected}
            folderName={folderName(selected.folderId)}
            health={health.byId.get(selected.id)}
            links={linkInsights.get(selected.id)}
            onEdit={() => setEditor({ open: true, item: selected })}
            onClosed={() => setSelectedId(null)}
            onBack={() => setSelectedId(null)}
          />
        ) : null}
      </section>

      {editorDrawer}
    </div>
  );
}

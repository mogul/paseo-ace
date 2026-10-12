import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import { Modal, ScrollView as HostScrollView, TextInput as HostTextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TextInput as NativeTextInput } from "react-native";
import { Dimensions, Pressable, ScrollView, Text, View } from "react-native";
import {
  UNASSIGNED_CARD_ID,
  boardAddZoneRpc,
  boardAdoptCardRpc,
  boardCreateCardRpc,
  boardCreateRpc,
  boardDeleteRpc,
  boardDeleteZoneRpc,
  boardMoveRpc,
  boardNewSessionRpc,
  boardProjectsRpc,
  boardRenameRpc,
  boardSetDefaultsRpc,
  boardSetLastVisitedRpc,
  boardStateRpc,
  boardUpdateZoneRpc,
  boardWorkspacesRpc,
  type Board,
  type BoardSummary,
  type CardDefaults,
  type Project,
  type Session,
  type WorkspaceCard,
  type Zone,
  type ZoneTrigger,
} from "../shared/contracts";

const DEFAULT_PROVIDER = "opencode/opencode-go/deepseek-v4-flash";
const SUGGESTED_PROMPT = "Review the working tree in {{workspace.directory}} and summarize what changed.";
const TEMPLATES = [
  "{{workspace.name}}",
  "{{workspace.directory}}",
  "{{workspace.kind}}",
  "{{branch.name}}",
  "{{pr.number}}",
  "{{pr.url}}",
  "{{pr.title}}",
  "{{zone.title}}",
];

type CreateCardInput = {
  boardId: string;
  zoneId: string;
  name: string;
  isolation: "worktree" | "directory";
  projectCwd: string;
  baseBranch?: string;
  provider?: string;
  modeId?: string;
  thinkingOptionId?: string;
  prompt?: string;
};

type Overlay =
  | { kind: "zone-settings"; zone: Zone }
  | { kind: "move"; card: WorkspaceCard }
  | { kind: "pick-session"; card: WorkspaceCard; zone: Zone }
  | { kind: "create-find-card"; zone: Zone }
  | { kind: "new-board" }
  | { kind: "rename-board" }
  | { kind: "card-defaults" };

interface MenuItem {
  label: string;
  danger?: boolean;
  checked?: boolean;
  onPress: () => void;
}
interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function BoardScreen({ theme, layout, navigation }: PluginScreenProps) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const getState = useRpc(boardStateRpc);
  const move = useRpc(boardMoveRpc);
  const addZone = useRpc(boardAddZoneRpc);
  const updateZone = useRpc(boardUpdateZoneRpc);
  const deleteZone = useRpc(boardDeleteZoneRpc);
  const newSession = useRpc(boardNewSessionRpc);
  const createBoard = useRpc(boardCreateRpc);
  const renameBoard = useRpc(boardRenameRpc);
  const deleteBoard = useRpc(boardDeleteRpc);
  const setLastVisited = useRpc(boardSetLastVisitedRpc);
  const setDefaults = useRpc(boardSetDefaultsRpc);
  const adoptCard = useRpc(boardAdoptCardRpc);
  const createCard = useRpc(boardCreateCardRpc);

  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const rootRef = useRef<View>(null);

  const query = useQuery({
    queryKey: ["ace", "board", selectedBoardId],
    queryFn: () => getState(selectedBoardId ? { boardId: selectedBoardId } : {}),
    refetchInterval: 3000,
  });

  const c = theme.colors;
  const compact = layout.compact;
  const styles = useMemo(
    () =>
      ({
        root: { flex: 1, backgroundColor: c.surface0 },
        banner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderBottomWidth: 1, borderBottomColor: c.border },
        bannerSide: { flex: 1, flexDirection: "row", alignItems: "center" },
        selector: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface1 },
        selectorText: { color: c.foreground, fontSize: 13, fontWeight: "600" },
        search: { flex: 1, color: c.foreground, backgroundColor: c.surface0, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 13 },
        dots: { color: c.foreground, fontSize: 18, paddingHorizontal: 6, paddingVertical: 2 },
        col: { width: 260, marginRight: 12, backgroundColor: c.surface1, borderRadius: 10, borderWidth: 1, borderColor: c.border },
        colTitle: { color: c.foreground, fontWeight: "600", padding: 10, borderBottomWidth: 1, borderBottomColor: c.border },
        zoneRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 10, paddingRight: 4, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border },
        zoneTitle: { color: c.foregroundMuted, fontSize: 12, textTransform: "uppercase" as const, letterSpacing: 0.4 },
        zoneSection: { backgroundColor: c.surface1, borderRadius: 10, borderWidth: 1, borderColor: c.border, marginBottom: 12 },
        cards: { padding: 8, gap: 8 },
        hint: { color: c.foregroundMuted, fontSize: 12, padding: 8 },
        addZoneBtn: { padding: 10, borderRadius: 8, borderWidth: 1, borderColor: c.border, borderStyle: "dashed" as const, alignItems: "center" as const, marginTop: 4 },
        addZoneText: { color: c.foregroundMuted, fontSize: 13 },
      }) as const,
    [c, compact],
  );

  const boardId = query.data?.boardId;
  const board = query.data?.board;
  const workspaces = query.data?.workspaces ?? [];
  const boards = query.data?.boards ?? [];

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["ace", "board"] });
  }

  function switchBoard(id: string) {
    setSelectedBoardId(id);
    void setLastVisited({ boardId: id }).catch((err) => toast.error(err instanceof Error ? err.message : String(err)));
  }

  async function doMove(card: WorkspaceCard, zoneId: string, reuseAgentId?: string) {
    if (!boardId) return;
    try {
      await move({ boardId, workspaceId: card.id, zoneId, reuseAgentId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return;
    }
    invalidate();
    setOverlay(null);
  }

  async function doAddZone() {
    if (!boardId) return;
    try {
      await addZone({ boardId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return;
    }
    invalidate();
  }

  async function doDeleteBoard() {
    if (!boardId) return;
    try {
      await deleteBoard({ boardId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return;
    }
    setSelectedBoardId(null);
    invalidate();
  }

  async function handleCreateBoard(name: string) {
    try {
      const { boardId: newId } = await createBoard({ name });
      setSelectedBoardId(newId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return;
    }
    invalidate();
    setOverlay(null);
  }

  async function handleRenameBoard(name: string) {
    if (!boardId) return;
    try {
      await renameBoard({ boardId, name });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return;
    }
    invalidate();
    setOverlay(null);
  }

  async function handleSetDefaults(cardDefaults: CardDefaults) {
    if (!boardId) return;
    try {
      await setDefaults({ boardId, cardDefaults });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return;
    }
    invalidate();
    setOverlay(null);
  }

  async function handleCreateCard(input: CreateCardInput) {
    try {
      await createCard(input);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return;
    }
    invalidate();
    setOverlay(null);
  }

  async function handleAdopt(zone: Zone, workspaceId: string) {
    if (!boardId) return;
    try {
      await adoptCard({ boardId, zoneId: zone.id, workspaceId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return;
    }
    invalidate();
    setOverlay(null);
  }

  function placeMenu(items: MenuItem[], pageX: number, pageY: number) {
    const root = rootRef.current;
    if (root && typeof root.measureInWindow === "function") {
      try {
        root.measureInWindow((rx, ry) => setMenu({ x: pageX - rx, y: pageY - ry, items }));
        return;
      } catch {
        // fall through to raw coordinates
      }
    }
    setMenu({ x: pageX, y: pageY, items });
  }

  function openBoardSelector(event: { nativeEvent: { pageX: number; pageY: number } }) {
    const items: MenuItem[] = boards.map((b) => ({
      label: b.name,
      checked: b.id === boardId,
      onPress: () => {
        setMenu(null);
        switchBoard(b.id);
      },
    }));
    items.push({
      label: "New board…",
      onPress: () => {
        setMenu(null);
        setOverlay({ kind: "new-board" });
      },
    });
    placeMenu(items, event.nativeEvent.pageX, event.nativeEvent.pageY);
  }

  function openSettingsMenu(event: { nativeEvent: { pageX: number; pageY: number } }) {
    placeMenu(
      [
        { label: "Rename board", onPress: () => { setMenu(null); setOverlay({ kind: "rename-board" }); } },
        { label: "Delete board", danger: true, onPress: () => { setMenu(null); void doDeleteBoard(); } },
        { label: "Edit card defaults", onPress: () => { setMenu(null); setOverlay({ kind: "card-defaults" }); } },
      ],
      event.nativeEvent.pageX,
      event.nativeEvent.pageY,
    );
  }

  function openZoneMenu(event: { nativeEvent: { pageX: number; pageY: number } }, zone: Zone) {
    placeMenu(
      [
        { label: "Settings", onPress: () => { setMenu(null); setOverlay({ kind: "zone-settings", zone }); } },
        { label: "Add card", onPress: () => { setMenu(null); setOverlay({ kind: "create-find-card", zone }); } },
        {
          label: "Delete",
          danger: true,
          onPress: () => {
            setMenu(null);
            if (!boardId) return;
            void deleteZone({ boardId, zoneId: zone.id })
              .then(() => invalidate())
              .catch((err) => toast.error(err instanceof Error ? err.message : String(err)));
          },
        },
      ],
      event.nativeEvent.pageX,
      event.nativeEvent.pageY,
    );
  }

  function toggleCard(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const q = search.trim().toLowerCase();
  const visibleWorkspaces = q
    ? workspaces.filter((ws) => ws.name.toLowerCase().includes(q) || (ws.branch ?? "").toLowerCase().includes(q))
    : workspaces;

  function renderZone(zone: Zone) {
    const cards = visibleWorkspaces.filter((ws) => ws.zoneId === zone.id);
    return (
      <View key={zone.id}>
        <View style={styles.zoneRow}>
          <Text style={styles.zoneTitle}>{zone.title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`${zone.title} menu`} onPress={(e) => openZoneMenu(e, zone)}>
            <Text style={styles.dots}>⋯</Text>
          </Pressable>
        </View>
        <View style={styles.cards}>
          {cards.length === 0 ? (
            <Text style={styles.hint}>No workspaces</Text>
          ) : (
            cards.map((ws) => (
              <WorkspaceCardView
                key={ws.id}
                card={ws}
                theme={theme}
                expanded={expanded.has(ws.id)}
                onToggle={() => toggleCard(ws.id)}
                onOpenAgent={(agentId) => navigation?.openAgent({ agentId })}
                onMove={() => setOverlay({ kind: "move", card: ws })}
                onNewSession={() => {
                  void newSession({ workspaceId: ws.id })
                    .then(({ agentId }) => {
                      invalidate();
                      navigation?.openAgent({ agentId });
                    })
                    .catch((err) => toast.error(err instanceof Error ? err.message : String(err)));
                }}
              />
            ))
          )}
        </View>
      </View>
    );
  }

  const columns = board?.columns ?? [];

  return (
    <View ref={rootRef} style={styles.root}>
      <View style={styles.banner}>
        <Pressable accessibilityRole="button" accessibilityLabel="Switch board" onPress={(e) => openBoardSelector(e)} style={styles.selector}>
          <Text style={styles.selectorText}>Board: {board?.name ?? "…"}</Text>
          <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>▾</Text>
        </Pressable>
        <View style={styles.bannerSide}>
          <HostTextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search"
            placeholderTextColor={c.foregroundMuted}
            style={styles.search}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <View style={[styles.bannerSide, { justifyContent: "flex-end" }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Board settings" onPress={(e) => openSettingsMenu(e)}>
            <Text style={styles.dots}>⋯</Text>
          </Pressable>
        </View>
      </View>

      {compact ? (
        <ScrollView contentContainerStyle={{ padding: 12 }}>
          {columns.flatMap((column) => column.zones.map((zone) => (
            <View key={zone.id} style={styles.zoneSection}>
              {renderZone(zone)}
            </View>
          )))}
          <Pressable accessibilityRole="button" onPress={() => void doAddZone()} style={styles.addZoneBtn}>
            <Text style={styles.addZoneText}>+ Add zone</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <ScrollView horizontal contentContainerStyle={{ padding: 12 }}>
          {columns.map((column) => (
            <View key={column.id} style={styles.col}>
              <Text style={styles.colTitle}>{column.title}</Text>
              {column.zones.map((zone) => renderZone(zone))}
            </View>
          ))}
          <Pressable accessibilityRole="button" onPress={() => void doAddZone()} style={[styles.addZoneBtn, { width: 160, alignSelf: "flex-start" }]}>
            <Text style={styles.addZoneText}>+ Add zone</Text>
          </Pressable>
        </ScrollView>
      )}

      {menu ? <ContextMenu menu={menu} theme={theme} onClose={() => setMenu(null)} /> : null}

      {overlay ? (
        <OverlayView
          overlay={overlay}
          theme={theme}
          boardId={boardId}
          board={board}
          boards={boards}
          onClose={() => setOverlay(null)}
          onSaveZone={async (zoneId, title, trigger) => {
            if (!boardId) return;
            try {
              await updateZone({ boardId, zoneId, title, trigger });
            } catch (err) {
              toast.error(err instanceof Error ? err.message : String(err));
              return;
            }
            invalidate();
            setOverlay(null);
          }}
          onMove={doMove}
          onPickZone={(card, zone) => {
            if (zone.trigger?.session.mode === "reuse") setOverlay({ kind: "pick-session", card, zone });
            else void doMove(card, zone.id);
          }}
          onCreateCard={handleCreateCard}
          onAdopt={handleAdopt}
          onCreatedBoard={handleCreateBoard}
          onRenameBoard={handleRenameBoard}
          onSaveDefaults={handleSetDefaults}
        />
      ) : null}
    </View>
  );
}

function ContextMenu({ menu, theme, onClose }: { menu: MenuState; theme: PluginTheme; onClose: () => void }) {
  const c = theme.colors;
  const width = Dimensions.get("window").width;
  const menuWidth = 180;
  const left = Math.max(8, Math.min(menu.x - menuWidth + 8, width - menuWidth - 8));
  return (
    <>
      <Pressable accessibilityRole="button" onPress={onClose} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      <View style={{ position: "absolute", top: menu.y + 4, left, width: menuWidth, backgroundColor: c.surface1, borderRadius: 8, borderWidth: 1, borderColor: c.border }}>
        {menu.items.map((item) => (
          <Pressable key={item.label} accessibilityRole="button" onPress={item.onPress} style={{ paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", gap: 6 }}>
            <Text style={{ color: item.danger ? c.statusDanger : c.foreground, fontSize: 14 }}>{item.checked ? "✓ " : ""}{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </>
  );
}

function WorkspaceCardView({
  card,
  theme,
  expanded,
  onToggle,
  onOpenAgent,
  onMove,
  onNewSession,
}: {
  card: WorkspaceCard;
  theme: PluginTheme;
  expanded: boolean;
  onToggle: () => void;
  onOpenAgent: (agentId: string) => void;
  onMove: () => void;
  onNewSession: () => void;
}) {
  const c = theme.colors;
  const ids = new Set(card.sessions.map((s) => s.id));
  const roots = card.sessions.filter((s) => !s.parentAgentId || !ids.has(s.parentAgentId));
  return (
    <View style={{ backgroundColor: c.surface0, borderRadius: 8, borderWidth: 1, borderColor: c.border, padding: 10, gap: 4 }}>
      <Pressable accessibilityRole="button" onPress={onToggle}>
        <Text style={{ color: c.foreground, fontWeight: "600", fontSize: 13 }}>{card.name}</Text>
        {card.branch ? <Text style={{ color: c.foregroundMuted, fontSize: 11 }}>{card.branch}</Text> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
          {card.pr ? (
            <View style={{ backgroundColor: c.border, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: c.foreground, fontSize: 11 }}>PR #{card.pr.number}</Text>
            </View>
          ) : null}
          {card.issues.map((issue, i) => (
            <View key={i} style={{ backgroundColor: c.border, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: c.foreground, fontSize: 11 }}>{issue}</Text>
            </View>
          ))}
        </View>
        <Text style={{ color: c.foregroundMuted, fontSize: 11, marginTop: 2 }}>
          {card.sessions.length} session{card.sessions.length === 1 ? "" : "s"}
        </Text>
      </Pressable>

      {expanded ? (
        <View style={{ gap: 2, marginTop: 4 }}>
          {roots.map((root) => (
            <SessionTree key={root.id} session={root} sessions={card.sessions} depth={0} theme={theme} onOpen={onOpenAgent} />
          ))}
          {card.id !== UNASSIGNED_CARD_ID ? (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              <Pressable accessibilityRole="button" onPress={onMove} style={{ padding: 6, borderRadius: 6, backgroundColor: c.border }}>
                <Text style={{ color: c.foreground, fontSize: 12 }}>Move</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={onNewSession} style={{ padding: 6, borderRadius: 6, backgroundColor: c.border }}>
                <Text style={{ color: c.foreground, fontSize: 12 }}>New session</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function SessionTree({ session, sessions, depth, theme, onOpen }: { session: Session; sessions: Session[]; depth: number; theme: PluginTheme; onOpen: (id: string) => void }) {
  const c = theme.colors;
  const children = sessions.filter((s) => s.parentAgentId === session.id);
  return (
    <View>
      <Pressable accessibilityRole="button" onPress={() => onOpen(session.id)} style={{ paddingLeft: depth * 12, paddingVertical: 2, flexDirection: "row", gap: 6 }}>
        <Text style={{ color: c.foreground, fontSize: 12 }}>• {session.title}</Text>
        <Text style={{ color: c.foregroundMuted, fontSize: 11 }}>{session.status}</Text>
      </Pressable>
      {children.map((child) => (
        <SessionTree key={child.id} session={child} sessions={sessions} depth={depth + 1} theme={theme} onOpen={onOpen} />
      ))}
    </View>
  );
}

function RadioOption({ theme, selected, label, onPress, disabled }: { theme: PluginTheme; selected: boolean; label: string; onPress: () => void; disabled?: boolean }) {
  const c = theme.colors;
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}>
      <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: selected ? c.accent : c.foregroundMuted, alignItems: "center", justifyContent: "center" }}>
        {selected ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }} /> : null}
      </View>
      <Text style={{ color: c.foreground, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

function PromptEditor({ theme, value, onChange, placeholder, minHeight = 120 }: { theme: PluginTheme; value: string; onChange: (v: string) => void; placeholder?: string; minHeight?: number }) {
  const c = theme.colors;
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const inputRef = useRef<NativeTextInput>(null);

  function insertTemplate(template: string) {
    const { start, end } = selection;
    const next = value.slice(0, start) + template + value.slice(end);
    onChange(next);
    const pos = start + template.length;
    setSelection({ start: pos, end: pos });
    inputRef.current?.focus();
  }

  return (
    <View style={{ gap: 8 }}>
      <HostTextInput
        ref={inputRef}
        multiline
        value={value}
        onChangeText={onChange}
        onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
        selection={selection}
        placeholder={placeholder}
        placeholderTextColor={c.foregroundMuted}
        style={{ color: c.foreground, backgroundColor: c.surface0, borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 8, fontSize: 13, minHeight, textAlignVertical: "top" }}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {TEMPLATES.map((template) => (
          <Pressable key={template} accessibilityRole="button" onPress={() => insertTemplate(template)} style={{ backgroundColor: c.border, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 }}>
            <Text style={{ color: c.foreground, fontSize: 11 }}>{template}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const inputStyle = (c: PluginTheme["colors"]) => ({ color: c.foreground, backgroundColor: c.surface0, borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 8, fontSize: 13 }) as const;
const labelStyle = (c: PluginTheme["colors"]) => ({ color: c.foreground, fontWeight: "600", fontSize: 13 }) as const;
const btn = (c: PluginTheme["colors"]) => ({ padding: 8, borderRadius: 8, backgroundColor: c.border }) as const;

function OverlayView({
  overlay,
  theme,
  boardId,
  board,
  boards,
  onClose,
  onSaveZone,
  onMove,
  onPickZone,
  onCreateCard,
  onAdopt,
  onCreatedBoard,
  onRenameBoard,
  onSaveDefaults,
}: {
  overlay: Overlay;
  theme: PluginTheme;
  boardId?: string;
  board?: Board;
  boards: BoardSummary[];
  onClose: () => void;
  onSaveZone: (zoneId: string, title: string, trigger: ZoneTrigger | null) => void;
  onMove: (card: WorkspaceCard, zoneId: string, reuseAgentId?: string) => void;
  onPickZone: (card: WorkspaceCard, zone: Zone) => void;
  onCreateCard: (input: CreateCardInput) => void;
  onAdopt: (zone: Zone, workspaceId: string) => void;
  onCreatedBoard: (name: string) => void;
  onRenameBoard: (name: string) => void;
  onSaveDefaults: (cardDefaults: CardDefaults) => void;
}) {
  switch (overlay.kind) {
    case "zone-settings":
      return <ZoneSettingsModal theme={theme} zone={overlay.zone} onClose={onClose} onSave={onSaveZone} />;
    case "move":
      return <MoveModal theme={theme} card={overlay.card} columns={board?.columns ?? []} onClose={onClose} onPickZone={onPickZone} />;
    case "pick-session":
      return <PickSessionModal theme={theme} card={overlay.card} zone={overlay.zone} onClose={onClose} onMove={onMove} />;
    case "create-find-card":
      return (
        <CreateFindCardModal
          theme={theme}
          zone={overlay.zone}
          boardId={boardId ?? ""}
          board={board}
          boards={boards}
          onClose={onClose}
          onCreateCard={onCreateCard}
          onAdopt={(workspaceId) => onAdopt(overlay.zone, workspaceId)}
        />
      );
    case "new-board":
      return <NewBoardModal theme={theme} onClose={onClose} onCreated={onCreatedBoard} />;
    case "rename-board":
      return <RenameBoardModal theme={theme} currentName={board?.name ?? ""} onClose={onClose} onRename={onRenameBoard} />;
    case "card-defaults":
      return <CardDefaultsModal theme={theme} defaults={board?.cardDefaults} onClose={onClose} onSave={onSaveDefaults} />;
  }
}

function ZoneSettingsModal({
  theme,
  zone,
  onClose,
  onSave,
}: {
  theme: PluginTheme;
  zone: Zone;
  onClose: () => void;
  onSave: (zoneId: string, title: string, trigger: ZoneTrigger | null) => void;
}) {
  const c = theme.colors;
  const [title, setTitle] = useState(zone.title);
  const [mode, setMode] = useState<"new" | "reuse">(zone.trigger?.session.mode ?? "new");
  const [action, setAction] = useState<"prompt" | "spawn">(zone.trigger?.action ?? "prompt");
  const [provider, setProvider] = useState(zone.trigger?.provider ?? DEFAULT_PROVIDER);
  const [prompt, setPrompt] = useState(zone.trigger?.prompt ?? "");

  const hasPrompt = prompt.trim().length > 0;
  const dim = hasPrompt ? 1 : 0.4;
  const trigger: ZoneTrigger | null = hasPrompt ? { session: { mode }, action, provider: provider.trim() || undefined, prompt } : null;

  return (
    <Modal title="Zone settings" open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Modal.Content contentContainerStyle={{ gap: 12 }}>
        <Text style={labelStyle(c)}>Name</Text>
        <HostTextInput value={title} onChangeText={setTitle} style={inputStyle(c)} />

        <Text style={labelStyle(c)}>Action on entry</Text>
        <PromptEditor theme={theme} value={prompt} onChange={setPrompt} placeholder={SUGGESTED_PROMPT} />

        <View style={{ opacity: dim }}>
          <Text style={labelStyle(c)}>Session</Text>
          <RadioOption theme={theme} disabled={!hasPrompt} selected={mode === "new"} label="Create a new session" onPress={() => setMode("new")} />
          <RadioOption theme={theme} disabled={!hasPrompt} selected={mode === "reuse"} label="Reuse a session" onPress={() => setMode("reuse")} />

          {mode === "reuse" ? (
            <>
              <Text style={labelStyle(c)}>Action</Text>
              <RadioOption theme={theme} disabled={!hasPrompt} selected={action === "prompt"} label="Prompt - send message" onPress={() => setAction("prompt")} />
              <RadioOption theme={theme} disabled={!hasPrompt} selected={action === "spawn"} label="Spawn - child session" onPress={() => setAction("spawn")} />
            </>
          ) : null}

          <Text style={labelStyle(c)}>Provider</Text>
          <HostTextInput value={provider} onChangeText={setProvider} editable={hasPrompt} autoCapitalize="none" autoCorrect={false} style={inputStyle(c)} />
        </View>

        <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}>
          <Pressable accessibilityRole="button" onPress={onClose} style={btn(c)}>
            <Text style={{ color: c.foreground }}>Cancel</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => onSave(zone.id, title.trim() || zone.title, trigger)} style={{ padding: 8, borderRadius: 8, backgroundColor: c.accent }}>
            <Text style={{ color: c.accentForeground, fontWeight: "600" }}>Save</Text>
          </Pressable>
        </View>
      </Modal.Content>
    </Modal>
  );
}

function MoveModal({
  theme,
  card,
  columns,
  onClose,
  onPickZone,
}: {
  theme: PluginTheme;
  card: WorkspaceCard;
  columns: Board["columns"];
  onClose: () => void;
  onPickZone: (card: WorkspaceCard, zone: Zone) => void;
}) {
  const c = theme.colors;
  return (
    <Modal title={`Move "${card.name}"`} open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Modal.Content scrollable={false} contentContainerStyle={{ gap: 12 }}>
        <HostScrollView style={{ maxHeight: 320 }}>
          {columns.map((column) =>
            column.zones.map((zone) => (
              <Pressable key={zone.id} accessibilityRole="button" onPress={() => onPickZone(card, zone)} style={{ padding: 10, borderRadius: 8, backgroundColor: c.border, marginBottom: 6 }}>
                <Text style={{ color: c.foreground }}>{column.title} / {zone.title}</Text>
              </Pressable>
            )),
          )}
        </HostScrollView>
        <Pressable accessibilityRole="button" onPress={onClose} style={btn(c)}>
          <Text style={{ color: c.foreground }}>Cancel</Text>
        </Pressable>
      </Modal.Content>
    </Modal>
  );
}

function PickSessionModal({
  theme,
  card,
  zone,
  onClose,
  onMove,
}: {
  theme: PluginTheme;
  card: WorkspaceCard;
  zone: Zone;
  onClose: () => void;
  onMove: (card: WorkspaceCard, zoneId: string, reuseAgentId?: string) => void;
}) {
  const c = theme.colors;
  return (
    <Modal title="Choose a session to reuse" open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Modal.Content scrollable={false} contentContainerStyle={{ gap: 12 }}>
        <HostScrollView style={{ maxHeight: 320 }}>
          {card.sessions.map((session) => (
            <Pressable key={session.id} accessibilityRole="button" onPress={() => onMove(card, zone.id, session.id)} style={{ padding: 10, borderRadius: 8, backgroundColor: c.border, marginBottom: 6 }}>
              <Text style={{ color: c.foreground }}>{session.title}</Text>
              <Text style={{ color: c.foregroundMuted, fontSize: 11 }}>{session.status}</Text>
            </Pressable>
          ))}
        </HostScrollView>
        <Pressable accessibilityRole="button" onPress={onClose} style={btn(c)}>
          <Text style={{ color: c.foreground }}>Cancel</Text>
        </Pressable>
      </Modal.Content>
    </Modal>
  );
}

function CreateFindCardModal({
  theme,
  zone,
  boardId,
  board,
  boards,
  onClose,
  onCreateCard,
  onAdopt,
}: {
  theme: PluginTheme;
  zone: Zone;
  boardId: string;
  board?: Board;
  boards: BoardSummary[];
  onClose: () => void;
  onCreateCard: (input: CreateCardInput) => void;
  onAdopt: (workspaceId: string) => void;
}) {
  const c = theme.colors;
  const toast = useToast();
  const getProjects = useRpc(boardProjectsRpc);
  const getState = useRpc(boardStateRpc);
  const getWorkspaces = useRpc(boardWorkspacesRpc);

  const [tab, setTab] = useState<"create" | "find">("create");

  const defaults: CardDefaults = board?.cardDefaults ?? { isolation: "worktree" };
  const [name, setName] = useState("");
  const [isolation, setIsolation] = useState<"worktree" | "directory">(defaults.isolation ?? "worktree");
  const [projectCwd, setProjectCwd] = useState(defaults.projectCwd ?? "");
  const [baseBranch, setBaseBranch] = useState(defaults.baseBranch ?? "");
  const [provider, setProvider] = useState(defaults.provider ?? DEFAULT_PROVIDER);
  const [modeId, setModeId] = useState(defaults.modeId ?? "");
  const [thinkingOptionId, setThinkingOptionId] = useState(defaults.thinkingOptionId ?? "");
  const [prompt, setPrompt] = useState(defaults.prompt ?? "");
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);

  const projectsQuery = useQuery({ queryKey: ["ace", "projects"], queryFn: () => getProjects({}), staleTime: 60000 });
  const projects: Project[] = projectsQuery.data?.projects ?? [];

  useEffect(() => {
    if (projects.length > 0 && !projects.some((p) => p.path === projectCwd)) {
      setProjectCwd(projects[0].path);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  const allWorkspacesQuery = useQuery({ queryKey: ["ace", "workspaces"], queryFn: () => getWorkspaces({}) });
  const allWorkspaces: WorkspaceCard[] = allWorkspacesQuery.data?.workspaces ?? [];

  const [otherPlacements, setOtherPlacements] = useState<Record<string, Record<string, string>>>({});
  useEffect(() => {
    const others = boards.filter((b) => b.id !== boardId);
    if (others.length === 0) {
      setOtherPlacements({});
      return;
    }
    let cancelled = false;
    Promise.all(
      others.map(async (b) => {
        const s = await getState({ boardId: b.id });
        return { id: b.id, placement: s.board.placement ?? {} };
      }),
    )
      .then((list) => {
        if (cancelled) return;
        const map: Record<string, Record<string, string>> = {};
        for (const item of list) map[item.id] = item.placement;
        setOtherPlacements(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [boards, boardId, getState]);

  const placements = useMemo(() => {
    const m: Record<string, Record<string, string>> = { [boardId]: board?.placement ?? {} };
    for (const [id, placement] of Object.entries(otherPlacements)) m[id] = placement;
    return m;
  }, [boardId, board, otherPlacements]);

  const placedWorkspaceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const placement of Object.values(placements)) {
      for (const id of Object.keys(placement)) ids.add(id);
    }
    return ids;
  }, [placements]);

  const candidates = allWorkspaces.filter((ws) => ws.id !== UNASSIGNED_CARD_ID);
  const unassigned = candidates.filter((ws) => !placedWorkspaceIds.has(ws.id));

  const selectedProject = projects.find((p) => p.path === projectCwd);
  const isGit = selectedProject ? selectedProject.isGit : true;

  useEffect(() => {
    if (!isGit && isolation === "worktree") setIsolation("directory");
  }, [isGit, isolation]);

  function submitCreate() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Workspace name is required.");
      return;
    }
    if (!projectCwd) {
      toast.error("Choose a project.");
      return;
    }
    onCreateCard({
      boardId,
      zoneId: zone.id,
      name: trimmedName,
      isolation,
      projectCwd,
      baseBranch: isolation === "worktree" ? baseBranch.trim() || undefined : undefined,
      provider: provider.trim() || undefined,
      modeId: modeId.trim() || undefined,
      thinkingOptionId: thinkingOptionId.trim() || undefined,
      prompt: prompt.trim() || undefined,
    });
  }

  return (
    <Modal title="Add card" open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Modal.Content contentContainerStyle={{ gap: 12 }}>
        <SegmentedControl
          theme={theme}
          options={[
            { id: "create", label: "Create card" },
            { id: "find", label: "Find card" },
          ]}
          value={tab}
          onChange={(v) => setTab(v as "create" | "find")}
        />

        {tab === "create" ? (
          <>
            <Text style={labelStyle(c)}>Name</Text>
            <HostTextInput value={name} onChangeText={setName} style={inputStyle(c)} />
            <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>Branch: {slugify(name) || "—"}</Text>

            <Text style={labelStyle(c)}>Project</Text>
            <Pressable accessibilityRole="button" onPress={() => setProjectPickerOpen((o) => !o)} style={{ ...inputStyle(c), flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: c.foreground }}>{selectedProject?.name ?? projectCwd ?? "Choose a project"}</Text>
              <Text style={{ color: c.foregroundMuted }}>▾</Text>
            </Pressable>
            {projectPickerOpen ? (
              <View style={{ backgroundColor: c.surface1, borderRadius: 8, borderWidth: 1, borderColor: c.border }}>
                {projects.map((p) => (
                  <Pressable key={p.id} accessibilityRole="button" onPress={() => { setProjectCwd(p.path); setProjectPickerOpen(false); }} style={{ padding: 10 }}>
                    <Text style={{ color: c.foreground }}>{p.name}</Text>
                    <Text style={{ color: c.foregroundMuted, fontSize: 11 }}>{p.path}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <Text style={labelStyle(c)}>Isolation</Text>
            <RadioOption theme={theme} disabled={!isGit} selected={isolation === "worktree"} label="Worktree" onPress={() => setIsolation("worktree")} />
            {!isGit ? <Text style={{ color: c.foregroundMuted, fontSize: 12, paddingLeft: 24 }}>This project is not a git repository</Text> : null}

            <View style={{ paddingLeft: 24, gap: 8 }}>
              <Text style={labelStyle(c)}>Base branch</Text>
              <HostTextInput value={baseBranch} onChangeText={setBaseBranch} editable={isolation === "worktree" && isGit} style={[inputStyle(c), isolation === "directory" || !isGit ? { opacity: 0.4 } : undefined]} autoCapitalize="none" autoCorrect={false} />
              <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>The new card creates a branch from this base.</Text>
            </View>

            <RadioOption theme={theme} selected={isolation === "directory"} label="Directory" onPress={() => setIsolation("directory")} />

            <ProviderModelSelector
              theme={theme}
              provider={provider}
              modeId={modeId}
              thinkingOptionId={thinkingOptionId}
              onChange={(next) => {
                setProvider(next.provider ?? "");
                setModeId(next.modeId ?? "");
                setThinkingOptionId(next.thinkingOptionId ?? "");
              }}
            />

            <Text style={labelStyle(c)}>Prompt</Text>
            <PromptEditor theme={theme} value={prompt} onChange={setPrompt} />

            <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}>
              <Pressable accessibilityRole="button" onPress={onClose} style={btn(c)}>
                <Text style={{ color: c.foreground }}>Cancel</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={submitCreate} style={{ padding: 8, borderRadius: 8, backgroundColor: c.accent }}>
                <Text style={{ color: c.accentForeground, fontWeight: "600" }}>Create card</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            {unassigned.length > 0 ? (
              <>
                <Text style={labelStyle(c)}>Unassigned workspaces</Text>
                {unassigned.map((ws) => (
                  <Pressable key={ws.id} accessibilityRole="button" onPress={() => onAdopt(ws.id)} style={{ padding: 10, borderRadius: 8, backgroundColor: c.border, marginBottom: 6 }}>
                    <Text style={{ color: c.foreground }}>{ws.name}</Text>
                    {ws.branch ? <Text style={{ color: c.foregroundMuted, fontSize: 11 }}>{ws.branch}</Text> : null}
                  </Pressable>
                ))}
              </>
            ) : (
              <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>No unassigned workspaces.</Text>
            )}

            {boards.filter((b) => b.id !== boardId).map((b) => {
              const cardIds = Object.keys(placements[b.id] ?? {});
              const cards = candidates.filter((ws) => cardIds.includes(ws.id));
              return (
                <View key={b.id} style={{ marginTop: 8 }}>
                  <Text style={{ color: c.foregroundMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
                    Board: {b.name}
                  </Text>
                  {cards.map((ws) => (
                    <View key={ws.id} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
                      <Text style={{ color: c.foregroundMuted }}>{ws.name}</Text>
                      {ws.branch ? <Text style={{ color: c.foregroundMuted, fontSize: 11 }}>{ws.branch}</Text> : null}
                    </View>
                  ))}
                </View>
              );
            })}
          </>
        )}
      </Modal.Content>
    </Modal>
  );
}

function NewBoardModal({ theme, onClose, onCreated }: { theme: PluginTheme; onClose: () => void; onCreated: (name: string) => void }) {
  const c = theme.colors;
  const [name, setName] = useState("");
  return (
    <Modal title="New board" open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Modal.Content contentContainerStyle={{ gap: 12 }}>
        <Text style={labelStyle(c)}>Name</Text>
        <HostTextInput value={name} onChangeText={setName} style={inputStyle(c)} autoFocus />
        <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}>
          <Pressable accessibilityRole="button" onPress={onClose} style={btn(c)}>
            <Text style={{ color: c.foreground }}>Cancel</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={!name.trim()} onPress={() => onCreated(name.trim())} style={{ padding: 8, borderRadius: 8, backgroundColor: c.accent, opacity: name.trim() ? 1 : 0.4 }}>
            <Text style={{ color: c.accentForeground, fontWeight: "600" }}>Create</Text>
          </Pressable>
        </View>
      </Modal.Content>
    </Modal>
  );
}

function RenameBoardModal({ theme, currentName, onClose, onRename }: { theme: PluginTheme; currentName: string; onClose: () => void; onRename: (name: string) => void }) {
  const c = theme.colors;
  const [name, setName] = useState(currentName);
  return (
    <Modal title="Rename board" open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Modal.Content contentContainerStyle={{ gap: 12 }}>
        <Text style={labelStyle(c)}>Name</Text>
        <HostTextInput value={name} onChangeText={setName} style={inputStyle(c)} autoFocus />
        <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}>
          <Pressable accessibilityRole="button" onPress={onClose} style={btn(c)}>
            <Text style={{ color: c.foreground }}>Cancel</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={!name.trim()} onPress={() => onRename(name.trim())} style={{ padding: 8, borderRadius: 8, backgroundColor: c.accent, opacity: name.trim() ? 1 : 0.4 }}>
            <Text style={{ color: c.accentForeground, fontWeight: "600" }}>Save</Text>
          </Pressable>
        </View>
      </Modal.Content>
    </Modal>
  );
}

type ProviderSelection = {
  provider?: string;
  modeId?: string;
  thinkingOptionId?: string;
};

function splitProvider(provider?: string): { harness: string; model: string } {
  const p = provider?.trim() ?? "";
  const idx = p.indexOf("/");
  if (idx === -1) return { harness: p, model: "" };
  return { harness: p.slice(0, idx), model: p.slice(idx + 1) };
}

function SegmentedControl({ theme, options, value, onChange }: { theme: PluginTheme; options: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  const c = theme.colors;
  return (
    <View style={{ flexDirection: "row", borderRadius: 8, borderWidth: 1, borderColor: c.border, overflow: "hidden", backgroundColor: c.surface0 }}>
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <Pressable key={opt.id} accessibilityRole="button" onPress={() => onChange(opt.id)} style={{ flex: 1, paddingVertical: 8, alignItems: "center", backgroundColor: active ? c.accent : "transparent" }}>
            <Text style={{ color: active ? c.accentForeground : c.foreground, fontWeight: "600", fontSize: 13 }}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Dropdown({
  theme,
  value,
  options,
  onSelect,
  disabled,
  placeholder,
  loading,
}: {
  theme: PluginTheme;
  value: string;
  options: { id: string; label: string }[];
  onSelect: (id: string) => void;
  disabled?: boolean;
  placeholder: string;
  loading?: boolean;
}) {
  const c = theme.colors;
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  const label = selected?.label ?? (value ? value : loading ? "Loading…" : placeholder);
  return (
    <View>
      <Pressable accessibilityRole="button" disabled={disabled} onPress={() => setOpen((o) => !o)} style={{ ...inputStyle(c), flexDirection: "row", justifyContent: "space-between", alignItems: "center", opacity: disabled ? 0.4 : 1 }}>
        <Text style={{ color: c.foreground }} numberOfLines={1}>{label}</Text>
        <Text style={{ color: c.foregroundMuted }}>▾</Text>
      </Pressable>
      {open && !disabled ? (
        <View style={{ backgroundColor: c.surface1, borderRadius: 8, borderWidth: 1, borderColor: c.border, marginTop: 2 }}>
          {options.length === 0 ? (
            <Text style={{ color: c.foregroundMuted, fontSize: 12, padding: 10 }}>{loading ? "Loading…" : "None available"}</Text>
          ) : (
            options.map((o) => (
              <Pressable key={o.id} accessibilityRole="button" onPress={() => { onSelect(o.id); setOpen(false); }} style={{ padding: 10 }}>
                <Text style={{ color: o.id === value ? c.accent : c.foreground }}>{o.label}</Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

function ProviderModelSelector({
  theme,
  provider,
  modeId,
  thinkingOptionId,
  onChange,
}: {
  theme: PluginTheme;
  provider?: string;
  modeId?: string;
  thinkingOptionId?: string;
  onChange: (next: ProviderSelection) => void;
}) {
  const paseo = usePaseo();

  const [sel, setSel] = useState(() => {
    const { harness, model } = splitProvider(provider);
    return { harness, model, modeId: modeId ?? "", thinkingOptionId: thinkingOptionId ?? "" };
  });

  const providersQuery = useQuery({ queryKey: ["ace", "providers"], queryFn: () => paseo.providers.listAvailable() });
  const modelsQuery = useQuery({
    queryKey: ["ace", "models", sel.harness],
    queryFn: () => paseo.providers.listModels(sel.harness),
    enabled: sel.harness.length > 0,
  });
  const modesQuery = useQuery({
    queryKey: ["ace", "modes", sel.harness],
    queryFn: () => paseo.providers.listModes(sel.harness),
    enabled: sel.harness.length > 0,
  });

  const providers = useMemo(() => (providersQuery.data?.providers ?? []).map((p) => ({ id: p.provider, label: p.provider })), [providersQuery.data]);
  const models = useMemo(() => (modelsQuery.data?.models ?? []).map((m) => ({ id: m.id, label: m.label })), [modelsQuery.data]);
  const modes = useMemo(() => (modesQuery.data?.modes ?? []).map((m) => ({ id: m.id, label: m.label })), [modesQuery.data]);

  const rawModels = useMemo(() => modelsQuery.data?.models ?? [], [modelsQuery.data]);
  const selectedModel = useMemo(() => rawModels.find((m) => m.id === sel.model) ?? null, [rawModels, sel.model]);
  const thinkingOptions = useMemo(() => (selectedModel?.thinkingOptions ?? []).map((t) => ({ id: t.id, label: t.label })), [selectedModel]);

  function apply(next: { harness: string; model: string; modeId: string; thinkingOptionId: string }) {
    setSel(next);
    onChange({
      provider: next.harness && next.model ? `${next.harness}/${next.model}` : undefined,
      modeId: next.modeId || undefined,
      thinkingOptionId: next.thinkingOptionId || undefined,
    });
  }

  useEffect(() => {
    if (!sel.harness) return;
    let next = sel;
    if (rawModels.length > 0 && (!sel.model || !rawModels.some((m) => m.id === sel.model))) {
      const def = rawModels.find((m) => m.isDefault) ?? rawModels[0];
      next = { ...next, model: def.id };
    }
    if (modes.length > 0 && (!next.modeId || !modes.some((m) => m.id === next.modeId))) {
      next = { ...next, modeId: modes[0].id };
    }
    const modelDef = rawModels.find((m) => m.id === next.model) ?? null;
    const topts = modelDef?.thinkingOptions ?? [];
    if (topts.length > 0 && (!next.thinkingOptionId || !topts.some((t) => t.id === next.thinkingOptionId))) {
      const def = topts.find((t) => t.isDefault) ?? topts[0];
      next = { ...next, thinkingOptionId: def.id };
    }
    if (next !== sel) apply(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, rawModels, modes]);

  return (
    <View style={{ gap: 8 }}>
      <View>
        <Text style={labelStyle(theme.colors)}>Provider</Text>
        <Dropdown theme={theme} value={sel.harness} options={providers} placeholder="Select provider" loading={providersQuery.isLoading} onSelect={(h) => apply({ harness: h, model: "", modeId: "", thinkingOptionId: "" })} />
      </View>
      <View>
        <Text style={labelStyle(theme.colors)}>Model</Text>
        <Dropdown theme={theme} value={sel.model} options={models} placeholder={sel.harness ? "Select model" : "Choose a provider first"} disabled={!sel.harness} loading={modelsQuery.isLoading} onSelect={(m) => apply({ ...sel, model: m, thinkingOptionId: "" })} />
      </View>
      <View>
        <Text style={labelStyle(theme.colors)}>Mode</Text>
        <Dropdown theme={theme} value={sel.modeId} options={modes} placeholder={sel.harness ? "Select mode" : "Choose a provider first"} disabled={!sel.harness} loading={modesQuery.isLoading} onSelect={(mo) => apply({ ...sel, modeId: mo })} />
      </View>
      <View>
        <Text style={labelStyle(theme.colors)}>Thinking option</Text>
        <Dropdown theme={theme} value={sel.thinkingOptionId} options={thinkingOptions} placeholder={selectedModel ? "Select thinking option" : "Select a model first"} disabled={!selectedModel} onSelect={(t) => apply({ ...sel, thinkingOptionId: t })} />
      </View>
    </View>
  );
}

function CardDefaultsModal({ theme, defaults, onClose, onSave }: { theme: PluginTheme; defaults?: CardDefaults; onClose: () => void; onSave: (cardDefaults: CardDefaults) => void }) {
  const c = theme.colors;
  const getProjects = useRpc(boardProjectsRpc);

  const [isolation, setIsolation] = useState<"worktree" | "directory">(defaults?.isolation ?? "worktree");
  const [projectCwd, setProjectCwd] = useState(defaults?.projectCwd ?? "");
  const [baseBranch, setBaseBranch] = useState(defaults?.baseBranch ?? "");
  const [provider, setProvider] = useState(defaults?.provider ?? DEFAULT_PROVIDER);
  const [modeId, setModeId] = useState(defaults?.modeId ?? "");
  const [thinkingOptionId, setThinkingOptionId] = useState(defaults?.thinkingOptionId ?? "");
  const [prompt, setPrompt] = useState(defaults?.prompt ?? "");
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);

  const projectsQuery = useQuery({ queryKey: ["ace", "projects"], queryFn: () => getProjects({}), staleTime: 60000 });
  const projects: Project[] = projectsQuery.data?.projects ?? [];

  useEffect(() => {
    if (projects.length > 0 && !projects.some((p) => p.path === projectCwd)) {
      setProjectCwd(projects[0].path);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  const selectedProject = projects.find((p) => p.path === projectCwd);
  const isGit = selectedProject ? selectedProject.isGit : true;

  useEffect(() => {
    if (!isGit && isolation === "worktree") setIsolation("directory");
  }, [isGit, isolation]);

  function submit() {
    onSave({
      isolation,
      projectCwd: projectCwd || undefined,
      baseBranch: baseBranch.trim() || undefined,
      provider: provider.trim() || undefined,
      modeId: modeId.trim() || undefined,
      thinkingOptionId: thinkingOptionId.trim() || undefined,
      prompt: prompt.trim() || undefined,
    });
  }

  return (
    <Modal title="Edit card defaults" open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Modal.Content contentContainerStyle={{ gap: 12 }}>
        <Text style={labelStyle(c)}>Project</Text>
        <Pressable accessibilityRole="button" onPress={() => setProjectPickerOpen((o) => !o)} style={{ ...inputStyle(c), flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: c.foreground }}>{selectedProject?.name ?? projectCwd ?? "Choose a project"}</Text>
          <Text style={{ color: c.foregroundMuted }}>▾</Text>
        </Pressable>
        {projectPickerOpen ? (
          <View style={{ backgroundColor: c.surface1, borderRadius: 8, borderWidth: 1, borderColor: c.border }}>
            {projects.map((p) => (
              <Pressable key={p.id} accessibilityRole="button" onPress={() => { setProjectCwd(p.path); setProjectPickerOpen(false); }} style={{ padding: 10 }}>
                <Text style={{ color: c.foreground }}>{p.name}</Text>
                <Text style={{ color: c.foregroundMuted, fontSize: 11 }}>{p.path}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Text style={labelStyle(c)}>Isolation</Text>
        <RadioOption theme={theme} disabled={!isGit} selected={isolation === "worktree"} label="Worktree" onPress={() => setIsolation("worktree")} />
        {!isGit ? <Text style={{ color: c.foregroundMuted, fontSize: 12, paddingLeft: 24 }}>This project is not a git repository</Text> : null}

        <Text style={labelStyle(c)}>Base branch</Text>
        <HostTextInput value={baseBranch} onChangeText={setBaseBranch} editable={isolation === "worktree" && isGit} style={[inputStyle(c), isolation === "directory" || !isGit ? { opacity: 0.4 } : undefined]} autoCapitalize="none" autoCorrect={false} />
        <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>The new card creates a branch from this base.</Text>

        <RadioOption theme={theme} selected={isolation === "directory"} label="Directory" onPress={() => setIsolation("directory")} />

        <ProviderModelSelector
          theme={theme}
          provider={provider}
          modeId={modeId}
          thinkingOptionId={thinkingOptionId}
          onChange={(next) => {
            setProvider(next.provider ?? "");
            setModeId(next.modeId ?? "");
            setThinkingOptionId(next.thinkingOptionId ?? "");
          }}
        />

        <Text style={labelStyle(c)}>Prompt</Text>
        <PromptEditor theme={theme} value={prompt} onChange={setPrompt} />

        <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}>
          <Pressable accessibilityRole="button" onPress={onClose} style={btn(c)}>
            <Text style={{ color: c.foreground }}>Cancel</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={submit} style={{ padding: 8, borderRadius: 8, backgroundColor: c.accent }}>
            <Text style={{ color: c.accentForeground, fontWeight: "600" }}>Save</Text>
          </Pressable>
        </View>
      </Modal.Content>
    </Modal>
  );
}

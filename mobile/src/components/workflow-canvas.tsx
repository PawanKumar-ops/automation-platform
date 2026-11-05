import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  LayoutAnimation,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, Pattern, Rect, Stop } from 'react-native-svg';

import { AiChatDrawer } from '@/components/ai-chat-drawer';
import { AiMark } from '@/components/ai-mark';
import { IconifyIcon } from '@/components/iconify-icon';

const NODE_W = 96;
const NODE_H = 90;
const COL = 128;
const ROW = 150;
const PAD = 40;
const MIN_SCALE = 0.4;
const MAX_SCALE = 2.2;
const FIT_MIN_SCALE = 0.75;
const NATIVE = Platform.OS !== 'web';
const TRASH = '__trash__';
const SLOT_DY = ROW; // "add after" slot sits one row below an end card

/** Apply a drop: `n:` swap places, `e:` insert on a connector, `a:` append under an end card. */
function applyDrop(nodes: FlowNode[], dragged: string, target: string) {
  const kind = target.slice(0, 2);
  const key = target.slice(2);
  const me = nodes.find((n) => n.key === dragged);
  if (!me || key === dragged) return null;
  if (kind === 'n:') {
    // Swap the two apps' places; structure and connections stay put.
    const other = nodes.find((n) => n.key === key);
    if (!other) return null;
    const data = (n: FlowNode) => {
      const { key: _k, parent: _p, ...rest } = n;
      return rest;
    };
    return {
      nodes: nodes.map((n) =>
        n.key === dragged ? { ...n, ...data(other) } : n.key === key ? { ...n, ...data(me) } : n
      ),
      selected: key,
    };
  }
  // Lift the dragged app out alone; its children rejoin its parent.
  const lifted = nodes.map((n) => (n.parent === dragged ? { ...n, parent: me.parent } : n));
  if (kind === 'e:') {
    const child = lifted.find((n) => n.key === key);
    if (!child || !child.parent) return null;
    const parent = child.parent;
    return {
      nodes: lifted.map((n) =>
        n.key === dragged ? { ...n, parent } : n.key === key ? { ...n, parent: dragged } : n
      ),
      selected: dragged,
    };
  }
  if (kind === 'a:') {
    return { nodes: lifted.map((n) => (n.key === dragged ? { ...n, parent: key } : n)), selected: dragged };
  }
  return null;
}

const APressable = Animated.createAnimatedComponent(Pressable);

type DragState = {
  key: string;
  drop: string | null;
  sx: number; // finger start (canvas)
  sy: number;
  fx: number; // finger now (canvas)
  fy: number;
  ox: number; // card centre at pick-up (canvas)
  oy: number;
  s: number;
};

type AppDef = {
  id: string;
  label: string;
  subtitle: string;
  icon: `${string}:${string}`;
  bg: string;
  accent: string;
  category: string;
};

type FlowNode = AppDef & { key: string; parent: string | null };

type DrawerTarget =
  | { mode: 'child'; parent: string | null }
  | { mode: 'insert'; parent: string; child: string };

const APPS: AppDef[] = [
  { id: 'webhooks', label: 'Webhooks', subtitle: 'Catch a hook', icon: 'logos:webhooks', bg: '#FCE9EF', accent: '#E9497A', category: 'Developer' },
  { id: 'slack', label: 'Slack', subtitle: 'Send a message', icon: 'logos:slack-icon', bg: '#E6F5FA', accent: '#36C5F0', category: 'Communication' },
  { id: 'openai', label: 'ChatGPT', subtitle: 'Generate text', icon: 'logos:openai-icon', bg: '#F3F3F1', accent: '#10A37F', category: 'AI' },
  { id: 'drive', label: 'Google Drive', subtitle: 'Upload a file', icon: 'logos:google-drive-2020', bg: '#E9F6EE', accent: '#1FA463', category: 'Storage' },
  { id: 'discord', label: 'Discord', subtitle: 'Get a message', icon: 'logos:discord-icon', bg: '#ECEEFF', accent: '#5865F2', category: 'Communication' },
  { id: 'notion', label: 'Notion', subtitle: 'Create a page', icon: 'logos:notion-icon', bg: '#F1F1EF', accent: '#2F2F2F', category: 'Productivity' },
  { id: 'airtable', label: 'Airtable', subtitle: 'Create a record', icon: 'logos:airtable', bg: '#FFF4E2', accent: '#FCB400', category: 'Productivity' },
  { id: 'github', label: 'GitHub', subtitle: 'New issue', icon: 'logos:github-icon', bg: '#EFF0F2', accent: '#24292F', category: 'Developer' },
  { id: 'gmail', label: 'Gmail', subtitle: 'Send an email', icon: 'logos:google-gmail', bg: '#FDECEA', accent: '#EA4335', category: 'Communication' },
  { id: 'calendar', label: 'Google Calendar', subtitle: 'Create event', icon: 'logos:google-calendar', bg: '#E8F0FE', accent: '#4285F4', category: 'Productivity' },
  { id: 'teams', label: 'Microsoft Teams', subtitle: 'Post a message', icon: 'logos:microsoft-teams', bg: '#EEEDFB', accent: '#5059C9', category: 'Communication' },
  { id: 'asana', label: 'Asana', subtitle: 'Create a task', icon: 'logos:asana-icon', bg: '#FDEDEE', accent: '#F06A6A', category: 'Productivity' },
  { id: 'trello', label: 'Trello', subtitle: 'Create a card', icon: 'logos:trello', bg: '#E6F0FB', accent: '#0079BF', category: 'Productivity' },
  { id: 'hubspot', label: 'HubSpot', subtitle: 'Create contact', icon: 'logos:hubspot', bg: '#FFEFE9', accent: '#FF7A59', category: 'CRM' },
  { id: 'salesforce', label: 'Salesforce', subtitle: 'Update a lead', icon: 'logos:salesforce', bg: '#E5F5FD', accent: '#00A1E0', category: 'CRM' },
  { id: 'stripe', label: 'Stripe', subtitle: 'New payment', icon: 'logos:stripe', bg: '#EFEEFF', accent: '#635BFF', category: 'Payments' },
  { id: 'shopify', label: 'Shopify', subtitle: 'New order', icon: 'logos:shopify', bg: '#EEF6E6', accent: '#7AB55C', category: 'Commerce' },
  { id: 'dropbox', label: 'Dropbox', subtitle: 'Save a file', icon: 'logos:dropbox', bg: '#E6F0FF', accent: '#0061FF', category: 'Storage' },
  { id: 'jira', label: 'Jira', subtitle: 'Create issue', icon: 'logos:jira', bg: '#E8F0FD', accent: '#2684FF', category: 'Developer' },
  { id: 'zoom', label: 'Zoom', subtitle: 'Schedule meeting', icon: 'logos:zoom-icon', bg: '#E7F1FF', accent: '#2D8CFF', category: 'Communication' },
  { id: 'whatsapp', label: 'WhatsApp', subtitle: 'Send a message', icon: 'logos:whatsapp-icon', bg: '#E8F8EE', accent: '#25D366', category: 'Communication' },
  { id: 'linear', label: 'Linear', subtitle: 'Create issue', icon: 'logos:linear-icon', bg: '#EEEFFC', accent: '#5E6AD2', category: 'Developer' },
];

const app = (id: string) => APPS.find((a) => a.id === id)!;

const INITIAL: FlowNode[] = [
  { ...app('webhooks'), subtitle: 'Webhook response', key: 'n1', parent: null },
  { ...app('slack'), subtitle: 'Get a user', key: 'n2', parent: 'n1' },
  { ...app('openai'), subtitle: 'Edit an image', key: 'n3', parent: 'n2' },
  { ...app('drive'), key: 'n4', parent: 'n1' },
  { ...app('webhooks'), subtitle: 'Webhook response', key: 'n5', parent: 'n4' },
  { ...app('discord'), key: 'n6', parent: 'n4' },
];

const PLUS_POS = {
  right: { right: -9, top: NODE_H / 2 - 9 },
  left: { left: -9, top: NODE_H / 2 - 9 },
  bottom: { left: NODE_W / 2 - 9, bottom: -9 },
} as const;

/** Tidy top-down tree layout: leaves get evenly spaced columns, parents center over children. */
function layout(nodes: FlowNode[]) {
  const kids = new Map<string | null, FlowNode[]>();
  nodes.forEach((n) => kids.set(n.parent, [...(kids.get(n.parent) ?? []), n]));
  const pos = new Map<string, { x: number; y: number }>();
  let leaf = 0;
  let maxDepth = 0;
  const place = (n: FlowNode, depth: number): number => {
    maxDepth = Math.max(maxDepth, depth);
    const children = kids.get(n.key) ?? [];
    let cx: number;
    if (!children.length) cx = leaf++ * COL;
    else {
      const xs = children.map((c) => place(c, depth + 1));
      cx = (xs[0] + xs[xs.length - 1]) / 2;
    }
    pos.set(n.key, { x: PAD + cx, y: PAD + depth * ROW });
    return cx;
  };
  (kids.get(null) ?? []).forEach((root) => place(root, 0));
  const width = PAD * 2 + Math.max(0, leaf - 1) * COL + NODE_W;
  const height = PAD * 2 + maxDepth * ROW + NODE_H + 30;
  return { pos, width, height };
}

function connector(p: { x: number; y: number }, c: { x: number; y: number }) {
  const x1 = p.x + NODE_W / 2;
  const y1 = p.y + NODE_H;
  const x2 = c.x + NODE_W / 2;
  const y2 = c.y - 7;
  const my = (y1 + y2) / 2;
  if (Math.abs(x1 - x2) < 1) {
    return { d: `M ${x1} ${y1} L ${x2} ${y2}`, mid: { x: x1, y: my }, end: { x: x2, y: y2 } };
  }
  const r = Math.min(14, Math.abs(x2 - x1) / 2, (y2 - y1) / 4);
  const dir = x2 > x1 ? 1 : -1;
  const d = [
    `M ${x1} ${y1}`,
    `L ${x1} ${my - r}`,
    `Q ${x1} ${my} ${x1 + dir * r} ${my}`,
    `L ${x2 - dir * r} ${my}`,
    `Q ${x2} ${my} ${x2} ${my + r}`,
    `L ${x2} ${y2}`,
  ].join(' ');
  return { d, mid: { x: (x1 + x2) / 2, y: my }, end: { x: x2, y: y2 } };
}

// Shared header metrics so floating controls can sit below it.
function useHeaderMetrics() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const k = Math.min(1.12, Math.max(0.95, width / 390));
  const btn = Math.round(48 * k);
  const top = insets.top + 12;
  return { k, btn, top, bottom: top + btn + 14 };
}

function Header({ onRun, running }: { onRun: () => void; running: boolean }) {
  const { k, btn, top } = useHeaderMetrics();
  const dot = btn - 8;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.header, { paddingTop: top, paddingHorizontal: Math.round(14 * k) }]}>
      <Pressable
        accessibilityLabel="Menu"
        style={[styles.menuBtn, { width: btn, height: btn, borderRadius: btn / 2 }]}>
        <IconifyIcon color="#FFFFFF" name="lucide:menu" size={Math.round(20 * k)} />
      </Pressable>
      <Pressable
        accessibilityLabel="Run once"
        onPress={onRun}
        style={[styles.runPill, { height: btn, borderRadius: btn / 2 }]}>
        <View style={[styles.runDot, { width: dot, height: dot, borderRadius: dot / 2 }]}>
          <IconifyIcon
            color="#FFFFFF"
            name={running ? 'lucide:loader' : 'lucide:play'}
            size={Math.round(15 * k)}
          />
        </View>
        <Text style={[styles.runText, { fontSize: Math.round(14 * k) }]}>
          {running ? 'Running…' : 'Run once'}
        </Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Search"
        style={[styles.searchBtn, { width: btn, height: btn, borderRadius: btn / 2 }]}>
        <IconifyIcon color="#1B1C1E" name="lucide:search" size={Math.round(19 * k)} />
      </Pressable>
    </View>
  );
}

function CanvasBackground() {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="bg" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#FFFFFF" />
        </LinearGradient>
        <Pattern height="20" id="dots" patternUnits="userSpaceOnUse" width="20">
          <Circle cx="10" cy="10" fill="#E8ECEC" r="1.1" />
        </Pattern>
      </Defs>
      <Rect fill="url(#bg)" height="100%" width="100%" />
      <Rect fill="url(#dots)" height="100%" opacity={0.8} width="100%" />
    </Svg>
  );
}

function Drawer({
  anim,
  onClose,
  onPick,
  title,
}: {
  anim: Animated.Value;
  onClose: () => void;
  onPick: (a: AppDef) => void;
  title: string;
}) {
  const [query, setQuery] = useState('');
  const filtered = APPS.filter((a) =>
    `${a.label} ${a.category} ${a.subtitle}`.toLowerCase().includes(query.trim().toLowerCase())
  );
  const { height: screenHeight } = useWindowDimensions();

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [screenHeight, 0],
  });

  const opacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.42],
  });

  const drawerOpacity = anim.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0.96, 1, 1],
  });
  const insets = useSafeAreaInsets();
  const drag = useRef(new Animated.Value(0)).current;
  const dragY = drag.interpolate({ inputRange: [0, 1000], outputRange: [0, 1000], extrapolateLeft: 'clamp' });

  // Drag the handle/header down to dismiss.
  const dragPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
        onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_, g) => {
          if (g.dy > 120 || g.vy > 0.8) {
            Animated.timing(drag, {
              toValue: 800,
              duration: 220,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: NATIVE,
            }).start(onClose);
          } else {
            Animated.timing(drag, {
  toValue: 0,
  duration: 220,
  easing: Easing.out(Easing.cubic),
  useNativeDriver: NATIVE,
}).start();
          }
        },
      }),
    [drag, onClose]
  );

  // Android hardware/gesture back closes the drawer.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  return (
    <View style={styles.drawerLayer}>
      <Animated.View style={[styles.scrim, { opacity }]}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1 }} />
      </Animated.View>
      <Animated.View
        style={[
          styles.drawer,
          {
            paddingBottom: insets.bottom,
            opacity: drawerOpacity,
            transform: [{ translateY }, { translateY: dragY }],
          },
        ]}>
        <View {...dragPan.panHandlers}>
          <View style={styles.handle} />
          <View style={styles.drawerHead}>
            <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.closeBtn}>
              <IconifyIcon color="#1B1C1E" name="lucide:x" size={20} />
            </Pressable>
            <Text style={styles.drawerTitle}>{title}</Text>
            <View style={{ width: 36 }} />
          </View>
        </View>
        <View style={styles.searchBox}>
          <IconifyIcon color="#8A8B87" name="lucide:search" size={17} />
          <TextInput
            autoCorrect={false}
            onChangeText={setQuery}
            placeholder="Search apps"
            placeholderTextColor="#9A9B97"
            style={styles.searchInput}
            value={query}
          />
          {query ? (
            <Pressable accessibilityLabel="Clear search" hitSlop={8} onPress={() => setQuery('')}>
              <IconifyIcon color="#8A8B87" name="lucide:circle-x" size={16} />
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.sectionLabel}>
          {query ? `${filtered.length} results` : 'All apps'}
        </Text>
        <ScrollView
          contentContainerStyle={styles.grid}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {filtered.map((a) => (
            <Pressable
              accessibilityLabel={`Add ${a.label}`}
              key={a.id}
              onPress={() => onPick(a)}
              style={({ pressed }) => [styles.appTile, pressed && { transform: [{ scale: 0.96 }] }]}>
              <View style={[styles.appIcon, { backgroundColor: a.bg }]}>
                <IconifyIcon name={a.icon} size={26} />
              </View>
              <Text numberOfLines={1} style={styles.appName}>
                {a.label}
              </Text>
              <Text numberOfLines={1} style={styles.appCat}>
                {a.category}
              </Text>
            </Pressable>
          ))}
          {!filtered.length ? <Text style={styles.empty}>No apps match “{query}”.</Text> : null}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

export function WorkflowCanvas() {
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [history, setHistory] = useState<FlowNode[][]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const header = useHeaderMetrics();
  const [target, setTarget] = useState<DrawerTarget | null>(null);
  const [running, setRunning] = useState(false);
  const [view, setView] = useState({ w: 390, h: 640 });
  const drawerAnim = useRef(new Animated.Value(0)).current;
  const [aiOpen, setAiOpen] = useState(false);

  const { pos, width, height } = useMemo(() => layout(nodes), [nodes]);

  // Drag a card to reconnect it (and its subtree) under another app.
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const touchStart = useRef({ x: 0, y: 0 });
  const ghost = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const lift = useRef(new Animated.Value(1)).current;
  const ghostFade = useRef(new Animated.Value(1)).current;
  const dropPulse = useRef(new Animated.Value(1)).current;
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const press = useRef(new Animated.Value(0)).current;
  const wiggle = useRef(new Animated.Value(0)).current;
  const trashIn = useRef(new Animated.Value(0)).current;
  const trashHover = useRef(new Animated.Value(0)).current;
  const autoPan = useRef<{ vx: number; vy: number; raf: number | null }>({ vx: 0, vy: 0, raf: null });
  const live = useRef({ nodes, pos, view });
  live.current = { nodes, pos, view };

  // Place each card's "+" on a side with free space: below for end-of-branch apps,
  // otherwise beside the card where no neighbouring app sits.
  const plusSide = (n: FlowNode, p: { x: number; y: number }): 'bottom' | 'right' | 'left' => {
    if (!nodes.some((c) => c.parent === n.key)) return 'bottom';
    const taken = (dir: 1 | -1) =>
      nodes.some((o) => {
        const q = pos.get(o.key);
        return !!q && o.key !== n.key && q.y === p.y && (q.x - p.x) * dir > 0 && Math.abs(q.x - p.x) < COL * 1.2;
      });
    if (!taken(1)) return 'right';
    if (!taken(-1)) return 'left';
    return 'right';
  };

  // Viewport transform (screen = t + s * world), applied to the whole workflow.
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const sc = useRef(new Animated.Value(1)).current;
  const cur = useRef({ x: 0, y: 0, s: 1 });
  const canvasOrigin = useRef({ x: 0, y: 0 });
  const canvasRef = useRef<{ measureInWindow: (cb: (x: number, y: number) => void) => void } | null>(null);

  const apply = useCallback(
    (x: number, y: number, s: number, animate = false) => {
      cur.current = { x, y, s };
      if (animate) {
        Animated.parallel([
          Animated.spring(tx, { toValue: x, useNativeDriver: NATIVE, damping: 20, stiffness: 180 }),
          Animated.spring(ty, { toValue: y, useNativeDriver: NATIVE, damping: 20, stiffness: 180 }),
          Animated.spring(sc, { toValue: s, useNativeDriver: NATIVE, damping: 20, stiffness: 180 }),
        ]).start();
      } else {
        tx.setValue(x);
        ty.setValue(y);
        sc.setValue(s);
      }
    },
    [sc, tx, ty]
  );

  const fit = useCallback(
    (w = view.w, h = view.h, animate = true) => {
      const availW = w - 40;
      const availH = h - header.bottom - 110;
      // Never shrink below a readable size; if the flow is still too big, keep it
      // centred horizontally and pinned to the top so the trigger stays in view.
      const s = Math.max(FIT_MIN_SCALE, Math.min(1, availW / width, availH / height));
      const x = 20 + (availW - width * s) / 2;
      const y = height * s > availH ? header.bottom : header.bottom + (availH - height * s) / 2;
      apply(x, y, s, animate);
    },
    [apply, header.bottom, height, view.h, view.w, width]
  );

  // Frame the flow when the first few steps are added.
  useEffect(() => {
    if (nodes.length > 0 && nodes.length <= 2) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length]);

  const zoomBy = (factor: number) => {
    const { x, y, s } = cur.current;
    const ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * factor));
    const cx = view.w / 2;
    const cy = view.h / 2;
    apply(cx - ((cx - x) * ns) / s, cy - ((cy - y) * ns) / s, ns, true);
  };

  const gesture = useRef({ x: 0, y: 0, s: 1, dist: 0, mx: 0, my: 0, touches: 0 });
  const pan = useMemo(() => {
    const begin = (touches: readonly { pageX: number; pageY: number }[]) => {
      const g = gesture.current;
      g.x = cur.current.x;
      g.y = cur.current.y;
      g.s = cur.current.s;
      g.touches = touches.length;
      if (touches.length >= 2) {
        const [a, b] = touches;
        g.dist = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) || 1;
        g.mx = (a.pageX + b.pageX) / 2 - canvasOrigin.current.x;
        g.my = (a.pageY + b.pageY) / 2 - canvasOrigin.current.y;
      } else if (touches.length === 1) {
        g.mx = touches[0].pageX - canvasOrigin.current.x;
        g.my = touches[0].pageY - canvasOrigin.current.y;
      }
    };
    return PanResponder.create({
      // Empty-canvas touches land here (cards claim their own), so taps can deselect.
      onStartShouldSetPanResponder: () => true,
      // Remember where the finger went down so a drag can tell if it began on a card.
      onStartShouldSetPanResponderCapture: (e) => {
        const t = e.nativeEvent.touches[0] ?? e.nativeEvent;
        touchStart.current = { x: t.pageX, y: t.pageY };
        return false;
      },
      onMoveShouldSetPanResponderCapture: (e, g) =>
        e.nativeEvent.touches.length >= 2 || Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5,
      onPanResponderGrant: (e) => {
        const touches = e.nativeEvent.touches;
        if (touches.length <= 1 && dragApi.current.start(touchStart.current.x, touchStart.current.y)) {
          const t = touches[0];
          if (t) dragApi.current.move(t.pageX, t.pageY);
          return;
        }
        begin(touches);
      },
      onPanResponderMove: (e) => {
        const touches = e.nativeEvent.touches;
        if (dragRef.current) {
          if (touches.length >= 2) {
            dragApi.current.end(true);
            begin(touches);
            return;
          }
          const t = touches[0];
          if (t) dragApi.current.move(t.pageX, t.pageY);
          return;
        }
        const g = gesture.current;
        if (touches.length !== g.touches) begin(touches);
        if (touches.length >= 2) {
          const [a, b] = touches;
          const dist = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) || 1;
          const mx = (a.pageX + b.pageX) / 2 - canvasOrigin.current.x;
          const my = (a.pageY + b.pageY) / 2 - canvasOrigin.current.y;
          const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (g.s * dist) / g.dist));
          apply(mx - ((g.mx - g.x) * s) / g.s, my - ((g.my - g.y) * s) / g.s, s);
        } else if (touches.length === 1) {
          const mx = touches[0].pageX - canvasOrigin.current.x;
          const my = touches[0].pageY - canvasOrigin.current.y;
          apply(g.x + mx - g.mx, g.y + my - g.my, g.s);
        }
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, g) => {
        if (dragRef.current) {
          dragApi.current.end(false);
          return;
        }
        if (Math.abs(g.dx) < 5 && Math.abs(g.dy) < 5 && g.numberActiveTouches <= 1) setSelected(null);
      },
      onPanResponderTerminate: () => {
        if (dragRef.current) dragApi.current.end(true);
      },
    });
  }, [apply]);

  const didFit = useRef(false);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setView({ w, h });
    canvasRef.current?.measureInWindow((x, y) => {
      canvasOrigin.current = { x, y };
    });
    if (!didFit.current) {
      didFit.current = true;
      fit(w, h, false);
    }
  };

  const openDrawer = (t: DrawerTarget) => {
    setTarget(t);
    drawerAnim.setValue(0);
    Animated.spring(drawerAnim, {
      toValue: 1,
      damping: 26,
      stiffness: 210,
      mass: 0.85,
      useNativeDriver: NATIVE,
    }).start();
  };

  const closeDrawer = useCallback(() => {
    Animated.timing(drawerAnim, {
      toValue: 0,
      duration: 260,
      easing: Easing.bezier(0.4, 0, 1, 1),
      useNativeDriver: NATIVE,
    }).start(({ finished }) => {
      if (finished) setTarget(null);
    });
  }, [drawerAnim]);

  const commit = (next: FlowNode[]) => {
    setHistory((h) => [...h.slice(-30), nodes]);
    setNodes(next);
  };

  const pick = (a: AppDef) => {
    if (!target) return;
    const key = `n${Date.now()}`;
    const node: FlowNode = { ...a, key, parent: target.parent };
    if (target.mode === 'insert') {
      commit([...nodes.map((n) => (n.key === target.child ? { ...n, parent: key } : n)), node]);
    } else {
      commit([...nodes, node]);
    }
    setSelected(key);
    closeDrawer();
  };

  const remove = (key: string) => {
    const victim = nodes.find((n) => n.key === key);
    if (!victim) return;
    commit(
      nodes
        .filter((n) => n.key !== key)
        .map((n) => (n.parent === key ? { ...n, parent: victim.parent } : n))
    );
    setSelected(victim.parent);
  };

  const toCanvas = (pageX: number, pageY: number) => ({
    x: pageX - canvasOrigin.current.x,
    y: pageY - canvasOrigin.current.y,
  });
  const toScreen = (wx: number, wy: number) => ({
    x: cur.current.x + wx * cur.current.s,
    y: cur.current.y + wy * cur.current.s,
  });

  const nodeAt = (cx: number, cy: number) => {
    const { x, y, s: k } = cur.current;
    const wx = (cx - x) / k;
    const wy = (cy - y) / k;
    const { nodes: ns, pos: ps } = live.current;
    for (let i = ns.length - 1; i >= 0; i--) {
      const p = ps.get(ns[i].key);
      if (p && wx >= p.x - 4 && wx <= p.x + NODE_W + 4 && wy >= p.y - 4 && wy <= p.y + NODE_H + 4) return ns[i].key;
    }
    return null;
  };

  // Drop targets: swap with a card, insert on a connector, append below an end card, or trash.
  const dropTargets = (dragged: string) => {
    const { nodes: ns, pos: ps } = live.current;
    const out: { id: string; x: number; y: number; r: number }[] = [];
    const hasKids = new Set(ns.map((n) => n.parent).filter(Boolean) as string[]);
    for (const n of ns) {
      const p = ps.get(n.key);
      if (!p || n.key === dragged) continue;
      out.push({ id: `n:${n.key}`, x: p.x + NODE_W / 2, y: p.y + NODE_H / 2, r: 58 });
      if (!hasKids.has(n.key)) out.push({ id: `a:${n.key}`, x: p.x + NODE_W / 2, y: p.y + SLOT_DY + NODE_H / 2, r: 60 });
      if (n.parent && n.parent !== dragged) {
        const pp = ps.get(n.parent);
        if (pp) {
          const { mid } = connector(pp, p);
          out.push({ id: `e:${n.key}`, x: mid.x, y: mid.y, r: 44 });
        }
      }
    }
    return out;
  };

  const findDrop = (d: DragState, fingerX: number, fingerY: number, gx: number, gy: number) => {
    const { view: v } = live.current;
    if (fingerY > v.h - 110 && Math.abs(fingerX - v.w / 2) < 100) return TRASH;
    const { x, y, s: k } = cur.current;
    const wx = (gx - x) / k;
    const wy = (gy - y) / k;
    let best: string | null = null;
    let score = 1;
    for (const t of dropTargets(d.key)) {
      const q = Math.hypot(t.x - wx, t.y - wy) / t.r;
      if (q < score) {
        score = q;
        best = t.id;
      }
    }
    return best;
  };

  const updateDrag = () => {
    const d = dragRef.current;
    if (!d) return;
    const gx = d.ox + (d.fx - d.sx);
    const gy = d.oy + (d.fy - d.sy);
    ghost.setValue({ x: gx, y: gy });
    const hit = findDrop(d, d.fx, d.fy, gx, gy);
    if (hit !== d.drop) {
      if ((hit === TRASH) !== (d.drop === TRASH)) {
        Animated.spring(trashHover, { toValue: hit === TRASH ? 1 : 0, useNativeDriver: false, damping: 13, stiffness: 240 }).start();
      }
      d.drop = hit;
      setDropKey(hit);
      if (hit) {
        dropPulse.setValue(0.94);
        Animated.spring(dropPulse, { toValue: 1.08, useNativeDriver: false, damping: 12, stiffness: 260 }).start();
      }
    }
  };

  // Pan the canvas while the finger rests near an edge.
  const tickAutoPan = () => {
    const a = autoPan.current;
    if (!dragRef.current || (!a.vx && !a.vy)) {
      a.raf = null;
      return;
    }
    const { x, y, s: k } = cur.current;
    apply(x + a.vx, y + a.vy, k);
    updateDrag();
    a.raf = requestAnimationFrame(tickAutoPan);
  };

  const dragStart = (pageX: number, pageY: number) => {
    const c = toCanvas(pageX, pageY);
    const key = nodeAt(c.x, c.y);
    if (!key) return false;
    const p = live.current.pos.get(key)!;
    const center = toScreen(p.x + NODE_W / 2, p.y + NODE_H / 2);
    dragRef.current = { key, drop: null, sx: c.x, sy: c.y, fx: c.x, fy: c.y, ox: center.x, oy: center.y, s: cur.current.s };
    ghost.setValue(center);
    ghostFade.setValue(1);
    lift.setValue(cur.current.s);
    Animated.spring(lift, { toValue: cur.current.s * 1.08, useNativeDriver: false, damping: 14, stiffness: 240 }).start();
    setDragKey(key);
    setDropKey(null);
    setSelected(key);
    setPressedKey(null);
    press.setValue(0);
    trashHover.setValue(0);
    trashIn.setValue(0);
    Animated.spring(trashIn, { toValue: 1, useNativeDriver: false, damping: 16, stiffness: 200 }).start();
    return true;
  };

  const dragMove = (pageX: number, pageY: number) => {
    const d = dragRef.current;
    if (!d) return;
    const c = toCanvas(pageX, pageY);
    d.fx = c.x;
    d.fy = c.y;
    const { w, h } = live.current.view;
    const edge = 56;
    const sp = (dist: number) => Math.round(((edge - dist) / edge) * 12);
    const a = autoPan.current;
    a.vx = c.x < edge ? sp(c.x) : c.x > w - edge ? -sp(w - c.x) : 0;
    a.vy = c.y < header.bottom ? sp(Math.max(0, c.y - header.bottom + edge)) : c.y > h - 120 - edge && c.y < h - 120 ? -sp(h - 120 - c.y) : 0;
    if ((a.vx || a.vy) && a.raf == null) a.raf = requestAnimationFrame(tickAutoPan);
    updateDrag();
  };

  const finishDrag = () => {
    Animated.timing(trashIn, { toValue: 0, duration: 160, useNativeDriver: false }).start();
    dragRef.current = null;
    setDragKey(null);
    setDropKey(null);
  };

  const dragEnd = (cancel: boolean) => {
    const d = dragRef.current;
    if (!d) return;
    autoPan.current.vx = autoPan.current.vy = 0;
    const target = cancel ? null : d.drop;
    if (!target) {
      // Glide back to where it was picked up.
      Animated.parallel([
        Animated.timing(ghost, { toValue: { x: d.ox, y: d.oy }, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        Animated.timing(lift, { toValue: d.s, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ]).start(finishDrag);
      d.drop = null;
      setDropKey(null);
      return;
    }
    Animated.parallel([
      Animated.timing(lift, { toValue: d.s * 0.9, duration: 170, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      Animated.timing(ghostFade, { toValue: 0, duration: 170, useNativeDriver: false }),
    ]).start(finishDrag);
    dragRef.current = null;
    if (target === TRASH) {
      remove(d.key);
      return;
    }
    const next = applyDrop(nodes, d.key, target);
    if (next) {
      LayoutAnimation.configureNext(LayoutAnimation.create(300, 'easeInEaseOut', 'opacity'));
      commit(next.nodes);
      setSelected(next.selected);
    }
  };

  const labelOf = (k: string) => nodes.find((n) => n.key === k)?.label ?? 'app';
  const hint = (() => {
    if (dropKey === TRASH) return { icon: 'lucide:trash-2' as const, text: 'Release to delete' };
    if (dropKey?.startsWith('n:')) return { icon: 'lucide:arrow-left-right' as const, text: `Swap with ${labelOf(dropKey.slice(2))}` };
    if (dropKey?.startsWith('e:')) {
      const c = nodes.find((n) => n.key === dropKey.slice(2));
      return { icon: 'lucide:between-horizontal-start' as const, text: `Insert between ${labelOf(c?.parent ?? '')} and ${c?.label ?? 'app'}` };
    }
    if (dropKey?.startsWith('a:')) return { icon: 'lucide:corner-down-right' as const, text: `Add after ${labelOf(dropKey.slice(2))}` };
    return { icon: 'lucide:move' as const, text: 'Drop on an app, a line, or a slot' };
  })();

  // Press feedback: the card pops up with a little wiggle to say "I can move now".
  const pressIn = (key: string) => {
    setSelected(key);
    setPressedKey(key);
    press.setValue(0);
    wiggle.setValue(0);
    Animated.parallel([
      Animated.spring(press, { toValue: 1, useNativeDriver: false, damping: 11, stiffness: 260 }),
      Animated.sequence([
        Animated.timing(wiggle, { toValue: -1, duration: 70, useNativeDriver: false }),
        Animated.timing(wiggle, { toValue: 1, duration: 110, useNativeDriver: false }),
        Animated.timing(wiggle, { toValue: 0, duration: 90, useNativeDriver: false }),
      ]),
    ]).start();
  };
  const pressOut = () => {
    Animated.spring(press, { toValue: 0, useNativeDriver: false, damping: 15, stiffness: 220 }).start(() =>
      setPressedKey(null)
    );
  };

  const dragApi = useRef({ start: dragStart, move: dragMove, end: dragEnd });
  dragApi.current = { start: dragStart, move: dragMove, end: dragEnd };

  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setNodes(prev);
  };

  const run = () => {
    setRunning(true);
    setTimeout(() => setRunning(false), 1600);
  };

  const drawerTitle =
    target?.mode === 'insert' ? 'Insert a step' : target?.parent ? 'Add next step' : 'Choose a trigger';

  return (
    <View style={styles.safe}>
      <View style={styles.shell}>
        <View
          {...pan.panHandlers}
          onLayout={onLayout}
          ref={canvasRef as never}
          style={styles.canvas}>
          <CanvasBackground />
          <Animated.View
            style={[
              styles.world,
              {
                width,
                height,
                transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }],
              },
            ]}>
            <Svg height={height} style={StyleSheet.absoluteFill} width={width}>
              {nodes.map((n) => {
                if (!n.parent) return null;
                const p = pos.get(n.parent);
                const c = pos.get(n.key);
                if (!p || !c) return null;
                const { d } = connector(p, c);
                return (
                  <Path
                    d={d}
                    fill="none"
                    key={`e-${n.key}`}
                    stroke={n.accent}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                  />
                );
              })}
              {nodes.map((n) => {
                if (!n.parent) return null;
                const p = pos.get(n.parent);
                const c = pos.get(n.key);
                if (!p || !c) return null;
                return (
                  <Circle
                    cx={p.x + NODE_W / 2}
                    cy={p.y + NODE_H}
                    fill={n.accent}
                    key={`s-${n.key}`}
                    r={3}
                  />
                );
              })}
              {nodes.map((n) => {
                if (!n.parent) return null;

                const p = pos.get(n.parent);
                const c = pos.get(n.key);

                if (!p || !c) return null;

                const { end } = connector(p, c);

                return (
                  <Path
                    key={`a-${n.key}`}
                    d={`M ${end.x - 3.5} ${end.y - 3.5} L ${end.x} ${end.y} L ${end.x + 3.5} ${end.y - 3.5}`}
                    fill="none"
                    stroke={n.accent}
                    strokeWidth={1.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })}
            </Svg>

            {nodes.map((n) => {
              if (!n.parent) return null;
              const p = pos.get(n.parent);
              const c = pos.get(n.key);
              if (!p || !c) return null;
              const { mid } = connector(p, c);
              return (
                <Pressable
                  accessibilityLabel={`Insert or edit step before ${n.label}`}
                  hitSlop={8}
                  key={`p-${n.key}`}
                  onPress={() => openDrawer({ mode: 'insert', parent: n.parent!, child: n.key })}
                  style={[styles.pencil, { left: mid.x - 11, top: mid.y - 11 }]}>
                  <IconifyIcon color="#2A2B2D" name="lucide:pencil" size={10} />
                </Pressable>
              );
            })}

            {nodes.map((n) => {
              const p = pos.get(n.key)!;
              const isSel = selected === n.key;
              const isDragged = dragKey === n.key;
              const isDrop = dropKey === `n:${n.key}`;
              const side = plusSide(n, p);
              return (
                <APressable
                  accessibilityHint="Drag onto another app to reconnect it"
                  accessibilityLabel={n.label}
                  key={n.key}
                  onPressIn={() => pressIn(n.key)}
                  onPressOut={pressOut}
                  style={[
                    styles.node,
                    { left: p.x, top: p.y, backgroundColor: n.bg },
                    isSel && !isDragged && [styles.nodeSelected, { borderColor: n.accent, shadowColor: n.accent }],
                    pressedKey === n.key &&
                    !isDragged && {
                      shadowOpacity: press.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.45] }),
                      shadowRadius: press.interpolate({ inputRange: [0, 1], outputRange: [12, 22] }),
                      zIndex: 20,
                      transform: [
                        { scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 1.09] }) },
                        { rotate: wiggle.interpolate({ inputRange: [-1, 1], outputRange: ['-3deg', '3deg'] }) },
                      ],
                    },
                    isDragged && styles.nodePlaceholder,
                    isDrop && [styles.nodeDrop, { borderColor: n.accent, transform: [{ scale: dropPulse }] }],
                  ]}>
                  <IconifyIcon name={n.icon} size={28} />
                  <Text numberOfLines={1} style={styles.nodeLabel}>
                    {n.label}
                  </Text>
                  <Text numberOfLines={2} style={styles.nodeSub}>
                    {n.subtitle}
                  </Text>
                  <Pressable
                    accessibilityLabel={`Add step after ${n.label}`}
                    hitSlop={10}
                    onPress={() => openDrawer({ mode: 'child', parent: n.key })}
                    style={[styles.addBelow, PLUS_POS[side]]}>
                    <IconifyIcon color="#2A2B2D" name="lucide:plus" size={11} />
                  </Pressable>
                  {isDrop ? (
                    <View pointerEvents="none" style={[styles.connectChip, { backgroundColor: n.accent }]}>
                      <IconifyIcon color="#FFFFFF" name="lucide:arrow-left-right" size={10} />
                      <Text style={styles.connectChipText}>Swap</Text>
                    </View>
                  ) : null}
                </APressable>
              );
            })}

            {dragKey
              ? nodes.map((n) => {
                const p = pos.get(n.key);
                if (!p || n.key === dragKey) return null;
                const items = [];
                if (n.parent && n.parent !== dragKey) {
                  const pp = pos.get(n.parent);
                  if (pp) {
                    const { mid } = connector(pp, p);
                    const on = dropKey === `e:${n.key}`;
                    items.push(
                      <Animated.View
                        key={`de-${n.key}`}
                        pointerEvents="none"
                        style={[
                          styles.insertDot,
                          { left: mid.x - 9, top: mid.y - 9, borderColor: n.accent },
                          on && [styles.insertDotOn, { left: mid.x - 46, backgroundColor: n.accent, transform: [{ scale: dropPulse }] }],
                        ]}>
                        {on ? (
                          <>
                            <IconifyIcon color="#FFFFFF" name="lucide:plus" size={11} />
                            <Text style={styles.insertText}>Insert here</Text>
                          </>
                        ) : (
                          <View style={[styles.insertCore, { backgroundColor: n.accent }]} />
                        )}
                      </Animated.View>
                    );
                  }
                }
                if (!nodes.some((c) => c.parent === n.key)) {
                  const on = dropKey === `a:${n.key}`;
                  items.push(
                    <Animated.View
                      key={`da-${n.key}`}
                      pointerEvents="none"
                      style={[
                        styles.slot,
                        { left: p.x, top: p.y + SLOT_DY },
                        on && [styles.slotOn, { borderColor: n.accent, backgroundColor: n.bg, transform: [{ scale: dropPulse }] }],
                      ]}>
                      <IconifyIcon color={on ? n.accent : '#A3A6AD'} name="lucide:plus" size={16} />
                      <Text style={[styles.slotText, on && { color: n.accent }]}>Add after</Text>
                    </Animated.View>
                  );
                }
                return items;
              })
              : null}
          </Animated.View>

          {nodes.length === 0 ? (
            <View pointerEvents="box-none" style={[styles.emptyWrap, { paddingTop: header.bottom, paddingBottom: 92 }]}>
              <Pressable
                accessibilityLabel="Add your first app"
                onPress={() => openDrawer({ mode: 'child', parent: null })}
                style={({ pressed }) => [styles.emptyCard, pressed && { transform: [{ scale: 0.98 }] }]}>
                <View style={styles.emptyStepRow}>
                  <View style={styles.emptyBadge}>
                    <IconifyIcon color="#E9497A" name="lucide:zap" size={12} />
                    <Text style={styles.emptyBadgeText}>TRIGGER</Text>
                  </View>
                  <Text style={styles.emptyStepNum}>Step 1</Text>
                </View>
                <View style={styles.emptyLogos}>
                  {APPS.slice(0, 4).map((a, i) => (
                    <View
                      key={a.id}
                      style={[styles.emptyLogo, { backgroundColor: a.bg, marginLeft: i ? -10 : 0, zIndex: 4 - i }]}>
                      <IconifyIcon name={a.icon} size={17} />
                    </View>
                  ))}
                  <View style={[styles.emptyLogo, styles.emptyLogoMore]}>
                    <Text style={styles.emptyLogoMoreText}>+{Math.max(0, APPS.length - 4)}</Text>
                  </View>
                </View>
                <Text style={styles.emptyTitle}>Start your workflow</Text>
                <Text style={styles.emptySub}>Choose the app event that kicks everything off.</Text>
                <View style={styles.emptyCta}>
                  <IconifyIcon color="#FFFFFF" name="lucide:plus" size={16} />
                  <Text style={styles.emptyCtaText}>Choose an app</Text>
                </View>
              </Pressable>
            </View>
          ) : null}

          {dragKey ? (
            <>
              <View pointerEvents="none" style={[styles.dragHint, { top: header.bottom }]}>
                <IconifyIcon color="#FFFFFF" name={hint.icon} size={13} />
                <Text style={styles.dragHintText}>{hint.text}</Text>
              </View>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.trashZone,
                  {
                    opacity: trashIn,
                    transform: [{ translateY: trashIn.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
                  },
                ]}>
                <Animated.View style={[styles.trashGlow, { opacity: trashHover }]} />
                <Animated.View
                  style={[
                    styles.trashCircle,
                    {
                      backgroundColor: trashHover.interpolate({ inputRange: [0, 1], outputRange: ['#FFFFFF', '#E5484D'] }),
                      borderColor: trashHover.interpolate({ inputRange: [0, 1], outputRange: ['#F6C9CA', '#E5484D'] }),
                      transform: [{ scale: trashHover.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] }) }],
                    },
                  ]}>
                  <IconifyIcon color={dropKey === TRASH ? '#FFFFFF' : '#E5484D'} name="lucide:trash-2" size={22} />
                </Animated.View>
                <View style={[styles.trashLabel, dropKey === TRASH && styles.trashLabelOn]}>
                  <Text style={[styles.trashText, dropKey === TRASH && { color: '#FFFFFF' }]}>
                    {dropKey === TRASH ? 'Release to delete' : 'Delete'}
                  </Text>
                </View>
              </Animated.View>
            </>
          ) : null}

          <View style={[styles.zoomBar, styles.zoomBarRest, { top: header.bottom }]}>
            <Pressable accessibilityLabel="Zoom in" onPress={() => zoomBy(1.25)} style={styles.zoomBtn}>
              <IconifyIcon color="#1B1C1E" name="lucide:zoom-in" size={16} />
            </Pressable>
            <Pressable accessibilityLabel="Zoom out" onPress={() => zoomBy(0.8)} style={styles.zoomBtn}>
              <IconifyIcon color="#1B1C1E" name="lucide:zoom-out" size={16} />
            </Pressable>
            <Pressable accessibilityLabel="Fit to screen" onPress={() => fit()} style={styles.zoomBtn}>
              <IconifyIcon color="#1B1C1E" name="lucide:maximize" size={15} />
            </Pressable>
          </View>

          <View pointerEvents={dragKey ? 'none' : 'auto'} style={[styles.toolbar, dragKey && { opacity: 0 }]}>
            <Pressable accessibilityLabel="Save" style={styles.toolBtn}>
              <IconifyIcon color="#2A2B2D" name="lucide:save" size={18} />
            </Pressable>
            <Pressable accessibilityLabel="Export" style={styles.toolBtn}>
              <IconifyIcon color="#2A2B2D" name="lucide:download" size={18} />
            </Pressable>
            <Pressable
              accessibilityLabel="Open AI chat"
              onPress={() => setAiOpen(true)}
              style={[styles.toolPrimary, aiOpen && { opacity: 0 }]}>
              <AiMark />
            </Pressable>
            <Pressable accessibilityLabel="Undo" onPress={undo} style={styles.toolBtn}>
              <IconifyIcon color={history.length ? '#2A2B2D' : '#B5B6B2'} name="lucide:undo-2" size={18} />
            </Pressable>
            <Pressable accessibilityLabel="Fit" onPress={() => fit()} style={styles.toolBtn}>
              <IconifyIcon color="#2A2B2D" name="lucide:ellipsis" size={19} />
            </Pressable>
          </View>
          <Header onRun={run} running={running} />

          {dragKey
            ? (() => {
              const n = nodes.find((x) => x.key === dragKey);
              if (!n) return null;
              return (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.node,
                    styles.ghost,
                    {
                      left: -NODE_W / 2,
                      top: -NODE_H / 2,
                      backgroundColor: n.bg,
                      borderColor: n.accent,
                      opacity: ghostFade,
                      transform: [{ translateX: ghost.x }, { translateY: ghost.y }, { scale: lift }],
                    },
                  ]}>
                  <IconifyIcon name={n.icon} size={28} />
                  <Text numberOfLines={1} style={styles.nodeLabel}>
                    {n.label}
                  </Text>
                  <Text numberOfLines={2} style={styles.nodeSub}>
                    {n.subtitle}
                  </Text>
                </Animated.View>
              );
            })()
            : null}
        </View>

        {aiOpen ? <AiChatDrawer onClosed={() => setAiOpen(false)} /> : null}

        {target ? (
          <Drawer anim={drawerAnim} onClose={closeDrawer} onPick={pick} title={drawerTitle} />
        ) : null}
      </View>
    </View>
  );
}

const shadow = {
  shadowColor: '#14161A',
  shadowOpacity: 0.08,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 4,
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  shell: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center', backgroundColor: '#FFFFFF' },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#141518',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#141518',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  runPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 5,
    paddingRight: 18,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEEEEC',
  },
  runDot: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#141518',
    alignItems: 'center',
    justifyContent: 'center',
  },
  runText: { fontSize: 13, fontWeight: '600', color: '#141518', letterSpacing: -0.2 },
  searchBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F5F5F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvas: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  } as object,
  world: { position: 'absolute', left: 0, top: 0, transformOrigin: '0 0' } as object,
  node: {
    position: 'absolute',
    width: NODE_W,
    height: NODE_H,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  nodeLabel: { marginTop: 6, fontSize: 11, fontWeight: '700', color: '#1B1C1E', letterSpacing: -0.2 },
  nodeDrop: { borderWidth: 2, borderStyle: 'dashed', shadowOpacity: 0.16, shadowRadius: 18, elevation: 10 },
  nodeSelected: {
    borderWidth: 1,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  insertDot: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  insertCore: { width: 6, height: 6, borderRadius: 3 },
  insertDotOn: {
    width: 92,
    height: 26,
    borderRadius: 13,
    flexDirection: 'row',
    gap: 4,
    borderWidth: 0,
    marginTop: -4,
    ...shadow,
    shadowOpacity: 0.2,
  },
  insertText: { fontSize: 10.5, fontWeight: '700', color: '#FFFFFF' },
  slot: {
    position: 'absolute',
    width: NODE_W,
    height: NODE_H,
    borderRadius: 22,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#C9CCD3',
    backgroundColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  slotOn: { borderWidth: 2 },
  slotText: { fontSize: 10.5, fontWeight: '600', color: '#A3A6AD' },
  nodePlaceholder: {
    opacity: 0.45,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#B9BCC3',
    shadowOpacity: 0,
    elevation: 0,
  },
  connectChip: {
    position: 'absolute',
    top: -13,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 20,
    paddingHorizontal: 7,
    borderRadius: 10,
  },
  connectChipText: { fontSize: 9, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.1 },
  ghost: {
    borderWidth: 1.5,
    shadowColor: '#14161A',
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 18,
    zIndex: 200,
  },
  dragHint: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    backgroundColor: '#141518',
    zIndex: 50,
  },
  dragHintText: { fontSize: 12, fontWeight: '600', color: '#FFFFFF', letterSpacing: -0.1 },
  trashZone: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 150,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 18,
    gap: 8,
    zIndex: 60,
  },
  trashGlow: {
    position: 'absolute',
    bottom: -60,
    width: 260,
    height: 200,
    borderRadius: 130,
    backgroundColor: 'rgba(229,72,77,0.14)',
  },
  trashCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E5484D',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  trashLabel: {
    height: 24,
    paddingHorizontal: 11,
    borderRadius: 12,
    justifyContent: 'center',
    backgroundColor: 'rgba(20,21,24,0.82)',
  },
  trashLabelOn: { backgroundColor: '#E5484D' },
  trashText: { fontSize: 11.5, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.1 },
  nodeSub: { marginTop: 1, fontSize: 8, color: '#86878A', textAlign: 'center', lineHeight: 10 },
  addBelow: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pencil: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#f8f8f8',
    alignItems: 'center',
    justifyContent: 'center',
  },

  zoomBar: {
    position: 'absolute',
    right: 14,
    borderRadius: 24,
    overflow: 'hidden',
  },
  emptyWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 68,
  } as object,
  emptyCard: {
    width: '100%',
    maxWidth: 232,
    padding: 14,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(20,22,26,0.06)',
    shadowColor: '#14161A',
    shadowOpacity: 0.1,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  emptyStepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  emptyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FDEEF3',
  },
  emptyBadgeText: { fontSize: 10, fontWeight: '800', color: '#E9497A', letterSpacing: 0.8 },
  emptyStepNum: { fontSize: 12, fontWeight: '600', color: '#A3A6AD' },
  emptyLogos: { flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 10 },
  emptyLogo: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyLogoMore: { marginLeft: -10, backgroundColor: '#F1F2F4' },
  emptyLogoMoreText: { fontSize: 12, fontWeight: '700', color: '#5C5F66' },
  emptyTitle: { fontSize: 16.5, fontWeight: '800', color: '#141518', letterSpacing: -0.5 },
  emptySub: { fontSize: 12.5, color: '#7A7C80', lineHeight: 17, marginTop: 3 },
  emptyCta: {
    marginTop: 12,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#141518',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyCtaText: { fontSize: 13.5, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.2 },
  zoomBarRest: {
    paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: 1,
    borderColor: '#EAEAE7',
    borderRadius: 24,
    ...shadow,
  },
  zoomBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbar: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 4,
    backgroundColor: 'transparent',
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  toolBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F5F5F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolPrimary: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerLayer: { ...StyleSheet.absoluteFill, zIndex: 100, elevation: 100 } as object,
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: '#0E0F11' } as object,
drawer: {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: '82%',
  borderTopLeftRadius: 30,
  borderTopRightRadius: 30,
  paddingHorizontal: 20,
  backgroundColor: '#FFFFFF',
  shadowColor: '#101114',
  shadowOpacity: 0.16,
  shadowRadius: 36,
  shadowOffset: { width: 0, height: -10 },
  elevation: 30,
  overflow: 'hidden',
},
handle: {
  alignSelf: 'center',
  width: 38,
  height: 5,
  borderRadius: 3,
  backgroundColor: '#D9DAD7',
  marginTop: 11,
  marginBottom: 12,
},
  drawerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  drawerTitle: { fontSize: 17, fontWeight: '700', color: '#1B1C1E', letterSpacing: -0.3 },
  searchBox: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: '#E4E4E1',
    backgroundColor: '#FAFAF9',
  },
  searchInput: { flex: 1, height: '100%', fontSize: 15, color: '#1B1C1E', outlineStyle: 'none' } as object,
  sectionLabel: {
    marginTop: 18,
    marginBottom: 10,
    fontSize: 12,
    fontWeight: '600',
    color: '#8A8B87',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14, paddingBottom: 40 },
  appTile: { width: '25%', alignItems: 'center', paddingHorizontal: 2 },
  appIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  appName: { fontSize: 11, fontWeight: '600', color: '#1B1C1E', maxWidth: '100%' },
  appCat: { fontSize: 9, color: '#9A9B97', marginTop: 1 },
  empty: { width: '100%', textAlign: 'center', color: '#8A8B87', marginTop: 30, fontSize: 14 },
});

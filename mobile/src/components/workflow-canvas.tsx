import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
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

import { IconifyIcon } from '@/components/iconify-icon';

const NODE_W = 96;
const NODE_H = 90;
const COL = 128;
const ROW = 150;
const PAD = 40;
const MIN_SCALE = 0.4;
const MAX_SCALE = 2.2;
const NATIVE = Platform.OS !== 'web';

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
  { id: 'drive', label: 'Google Drive', subtitle: 'Upload a file', icon: 'logos:google-drive', bg: '#E9F6EE', accent: '#1FA463', category: 'Storage' },
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

const RAIL = ['slack', 'openai', 'discord', 'webhooks', 'notion', 'airtable', 'drive'].map(app);

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
  const btn = Math.round(42 * k);
  const top = insets.top + 10;
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
          <Stop offset="0" stopColor="#F7F8FB" />
          <Stop offset="0.55" stopColor="#F4F5F2" />
          <Stop offset="1" stopColor="#EEF1F6" />
        </LinearGradient>
        <Pattern height="20" id="dots" patternUnits="userSpaceOnUse" width="20">
          <Circle cx="10" cy="10" fill="#C9CCD3" r="1.1" />
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
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [700, 0] });
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] });
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
          { paddingBottom: insets.bottom, transform: [{ translateY }, { translateY: dragY }] },
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

  const { pos, width, height } = useMemo(() => layout(nodes), [nodes]);

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
      const availW = w - 70;
      const availH = h - header.bottom - 110;
      const s = Math.max(MIN_SCALE, Math.min(1.15, availW / width, availH / height));
      apply(56 + (availW - width * s) / 2, header.bottom + (availH - height * s) / 2, s, animate);
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
      onMoveShouldSetPanResponderCapture: (e, g) =>
        e.nativeEvent.touches.length >= 2 || Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
      onPanResponderGrant: (e) => begin(e.nativeEvent.touches),
      onPanResponderMove: (e) => {
        const touches = e.nativeEvent.touches;
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
    Animated.timing(drawerAnim, {
      toValue: 1,
      duration: 320,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: NATIVE,
    }).start();
  };

  const closeDrawer = useCallback(() => {
    Animated.timing(drawerAnim, {
      toValue: 0,
      duration: 240,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: NATIVE,
    }).start(() => setTarget(null));
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
                    d={`M ${end.x - 5} ${end.y - 1} L ${end.x} ${end.y + 6} L ${end.x + 5} ${end.y - 1} Z`}
                    fill={n.accent}
                    key={`a-${n.key}`}
                    stroke={n.accent}
                    strokeLinejoin="round"
                    strokeWidth={1}
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
                  style={[styles.pencil, { left: mid.x - 11, top: mid.y - 11, borderColor: n.accent }]}>
                  <IconifyIcon color="#2A2B2D" name="lucide:pencil" size={10} />
                </Pressable>
              );
            })}

            {nodes.map((n) => {
              const p = pos.get(n.key)!;
              const isSel = selected === n.key;
              const side = plusSide(n, p);
              return (
                <Pressable
                  accessibilityLabel={n.label}
                  key={n.key}
                  onLongPress={() => remove(n.key)}
                  onPress={() => setSelected(n.key)}
                  style={[
                    styles.node,
                    { left: p.x, top: p.y, backgroundColor: n.bg },
                    isSel && { borderColor: n.accent, borderWidth: 1.5 },
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
                </Pressable>
              );
            })}
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

          <View style={[styles.rail, { top: header.bottom }]}>
            <Pressable
              accessibilityLabel="Add app"
              onPress={() => openDrawer({ mode: 'child', parent: selected ?? nodes[0]?.key ?? null })}
              style={styles.railAdd}>
              <IconifyIcon color="#1B1C1E" name="lucide:plus" size={20} />
            </Pressable>
            {RAIL.map((a) => (
              <Pressable
                accessibilityLabel={`Add ${a.label}`}
                key={a.id}
                onPress={() => {
                  const key = `n${Date.now()}`;
                  commit([...nodes, { ...a, key, parent: selected ?? nodes[0]?.key ?? null }]);
                  setSelected(key);
                }}
                style={styles.railIcon}>
                <IconifyIcon name={a.icon} size={19} />
              </Pressable>
            ))}
          </View>

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

          <View style={styles.toolbar}>
            <Pressable accessibilityLabel="Save" style={styles.toolBtn}>
              <IconifyIcon color="#2A2B2D" name="lucide:save" size={18} />
            </Pressable>
            <Pressable accessibilityLabel="Export" style={styles.toolBtn}>
              <IconifyIcon color="#2A2B2D" name="lucide:download" size={18} />
            </Pressable>
            <Pressable
              accessibilityLabel="Add step"
              onPress={() => openDrawer({ mode: 'child', parent: selected ?? nodes[0]?.key ?? null })}
              style={styles.toolPrimary}>
              <IconifyIcon color="#FFFFFF" name="lucide:plus" size={22} />
            </Pressable>
            <Pressable accessibilityLabel="Undo" onPress={undo} style={styles.toolBtn}>
              <IconifyIcon color={history.length ? '#2A2B2D' : '#B5B6B2'} name="lucide:undo-2" size={18} />
            </Pressable>
            <Pressable accessibilityLabel="Fit" onPress={() => fit()} style={styles.toolBtn}>
              <IconifyIcon color="#2A2B2D" name="lucide:ellipsis" size={19} />
            </Pressable>
          </View>
          <Header onRun={run} running={running} />
        </View>

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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#141518',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  runPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 4,
    paddingRight: 16,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEEEEC',
  },
  runDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#141518',
    alignItems: 'center',
    justifyContent: 'center',
  },
  runText: { fontSize: 13, fontWeight: '600', color: '#141518', letterSpacing: -0.2 },
  searchBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEEEEC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvas: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#F5F6F4',
  } as object,
  world: { position: 'absolute', left: 0, top: 0, transformOrigin: '0 0' } as object,
  node: {
    position: 'absolute',
    width: NODE_W,
    height: NODE_H,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    ...shadow,
    shadowOpacity: 0.06,
  },
  nodeLabel: { marginTop: 6, fontSize: 11, fontWeight: '700', color: '#1B1C1E', letterSpacing: -0.2 },
  nodeSub: { marginTop: 1, fontSize: 8, color: '#86878A', textAlign: 'center', lineHeight: 10 },
  addBelow: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pencil: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  rail: {
    position: 'absolute',
    left: 10,
    width: 46,
    paddingVertical: 8,
    gap: 6,
    borderRadius: 23,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: '#EEEEEB',
    ...shadow,
  },
  railAdd: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F2F2F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  railIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#F0F0EE',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBar: {
    position: 'absolute',
    right: 10,
    borderRadius: 18,
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
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: '#EEEEEB',
    ...shadow,
  },
  zoomBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  toolbar: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 6,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderWidth: 1,
    borderColor: '#ECECEA',
    ...shadow,
    shadowOpacity: 0.12,
  },
  toolBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#EFEFED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolPrimary: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#16181C',
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
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    backgroundColor: '#FFFFFF',
    ...shadow,
    shadowOpacity: 0.2,
    shadowRadius: 30,
    elevation: 30,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#DCDCD9',
    marginTop: 10,
    marginBottom: 10,
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

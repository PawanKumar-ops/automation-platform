import { type ComponentRef, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { AiMark } from '@/components/ai-mark';
import { IconifyIcon } from '@/components/iconify-icon';

/* ------------------------------------------------------------------ data */

type Role = 'user' | 'ai';
type Msg = { id: string; role: Role; text: string; time: string; rating?: 'up' | 'down' };
type Chat = { id: string; title: string; group: 'Today' | 'Yesterday' | 'Previous 7 days'; messages: Msg[] };

const now = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
let seq = 0;
const uid = () => `m${Date.now()}${seq++}`;

const SEED: Chat[] = [
  {
    id: 'c1',
    title: 'Automate new lead follow-ups',
    group: 'Today',
    messages: [
      { id: 'a', role: 'user', text: 'When a new lead fills my Typeform, can you notify sales and add them to HubSpot?', time: '9:41 AM' },
      {
        id: 'b',
        role: 'ai',
        time: '9:41 AM',
        text: 'Sure. Here is a flow that does exactly that:\n\n1. **Trigger** — Typeform: new response\n2. **Action** — HubSpot: create or update contact\n3. **Action** — Slack: post to #sales with the lead details\n\nWant me to add a filter so only leads with a company email get through?',
      },
      { id: 'c', role: 'user', text: 'Yes, filter out gmail and yahoo addresses.', time: '9:42 AM' },
      {
        id: 'd',
        role: 'ai',
        time: '9:42 AM',
        text: 'Done. I added a **Filter** step after the trigger:\n\n`email does not contain @gmail.com, @yahoo.com`\n\nPersonal emails now stop there, and everyone else continues to HubSpot and Slack.',
      },
      { id: 'c2u', role: 'user', text: 'Can the Slack message tag the account owner too?', time: '9:44 AM' },
      {
        id: 'd2',
        role: 'ai',
        time: '9:44 AM',
        text: 'Yes. I mapped the HubSpot **Contact owner** to their Slack user, so the message now reads:\n\n`New lead: {name} from {company} — @owner`\n\nIf a lead has no owner yet, it falls back to tagging **@sales-team**.',
      },
      { id: 'c3u', role: 'user', text: 'Perfect. Will this run for old responses?', time: '9:45 AM' },
      {
        id: 'd3',
        role: 'ai',
        time: '9:45 AM',
        text: 'No — it only runs for **new** responses from the moment you turn it on. If you want to import past leads, I can add a one-time **Backfill** step that processes your last 30 days of responses.',
      },
    ],
  },
  {
    id: 'c2',
    title: 'Weekly report to Google Sheets',
    group: 'Yesterday',
    messages: [
      { id: 'e', role: 'user', text: 'Every Monday, pull last week’s Stripe payments into a sheet.', time: '4:10 PM' },
      {
        id: 'f',
        role: 'ai',
        time: '4:10 PM',
        text: 'Use a **Schedule** trigger (Mondays, 8:00 AM) → **Stripe: list payments** for the last 7 days → **Google Sheets: append rows**. I can also total the amounts in a summary row.',
      },
    ],
  },
  {
    id: 'c3',
    title: 'Why did my Gmail step fail?',
    group: 'Previous 7 days',
    messages: [
      { id: 'g', role: 'user', text: 'My Gmail step keeps failing with an auth error.', time: 'Mon' },
      { id: 'h', role: 'ai', time: 'Mon', text: 'That usually means the Google connection expired. Reconnect your account in **Gmail → Account**, then run the step again.' },
    ],
  },
];

const SUGGESTIONS = [
  { icon: 'lucide:workflow', text: 'Build a workflow for me' },
  { icon: 'lucide:bug', text: 'Why is my flow failing?' },
  { icon: 'lucide:sparkles', text: 'Suggest automations' },
  { icon: 'lucide:file-text', text: 'Summarize this workflow' },
] as const;

function mockReply(q: string) {
  const s = q.toLowerCase();
  if (/(fail|error|bug|broken)/.test(s))
    return 'Let’s debug it. The most common causes are:\n\n1. **Expired connection** — reconnect the app account\n2. **Missing field** — a required input is empty\n3. **Rate limit** — too many runs in a short time\n\nOpen the failing step and tap **Test** — I’ll explain the exact error.';
  if (/(summar|explain|what does)/.test(s))
    return 'This workflow starts with a **trigger**, then passes the data through each connected step in order. Each step can read fields from the steps before it, so the output of one app becomes the input of the next.';
  if (/(suggest|idea|automat)/.test(s))
    return 'Here are a few popular automations:\n\n- **Slack** alert for every new Stripe payment\n- Save **Gmail** attachments to Google Drive\n- Create **Notion** tasks from starred emails\n- Daily **Sheets** digest of new form responses\n\nTap any idea and I’ll build it.';
  return 'Great idea. I’d build it like this:\n\n1. **Trigger** — the event that starts the flow\n2. **Transform** — clean up and map the fields\n3. **Action** — send the result to your app\n\nTell me which apps you use and I’ll set up the steps on your canvas.';
}

/* ------------------------------------------------------------ rich text */

function RichText({ text, color }: { text: string; color: string }) {
  return (
    <View style={{ gap: 6 }}>
      {text.split('\n').filter((l, i, a) => l || (i > 0 && a[i - 1])).map((line, i) => {
        if (!line) return <View key={i} style={{ height: 2 }} />;
        const list = line.match(/^(\d+\.|-)\s+(.*)$/);
        const body = list ? list[2] : line;
        const parts = body.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
        const content = (
          <Text style={[styles.msgText, { color }]}>
            {parts.map((p, j) =>
              p.startsWith('**') ? (
                <Text key={j} style={{ fontWeight: '700' }}>{p.slice(2, -2)}</Text>
              ) : p.startsWith('`') ? (
                <Text key={j} style={styles.code}>{` ${p.slice(1, -1)} `}</Text>
              ) : (
                p
              )
            )}
          </Text>
        );
        if (!list) return <View key={i}>{content}</View>;
        return (
          <View key={i} style={styles.listRow}>
            <Text style={[styles.listMark, { color }]}>{list[1] === '-' ? '•' : list[1]}</Text>
            <View style={{ flex: 1 }}>{content}</View>
          </View>
        );
      })}
    </View>
  );
}

function TypingDots() {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(a, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [a]);
  return (
    <View style={styles.typing}>
      {[0, 1, 2].map((i) => {
        const o = a.interpolate({
          inputRange: [0, 0.2 + i * 0.15, 0.4 + i * 0.15, 1],
          outputRange: [0.25, 1, 0.25, 0.25],
        });
        return <Animated.View key={i} style={[styles.dot, { opacity: o, transform: [{ scale: o.interpolate({ inputRange: [0.25, 1], outputRange: [0.8, 1.1] }) }] }]} />;
      })}
    </View>
  );
}


/**
 * Web only: lets a mouse click-and-drag scroll the chat, like a finger does on a
 * phone. Small movements still count as clicks, so buttons keep working.
 */
function useMouseDragScroll(ref: RefObject<ComponentRef<typeof ScrollView> | null>) {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = (ref.current as unknown as { getScrollableNode?: () => HTMLElement } | null)?.getScrollableNode?.();
    if (!node) return;
    let startY = 0;
    let startTop = 0;
    let down = false;
    let dragging = false;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea')) return;
      down = true;
      dragging = false;
      startY = e.clientY;
      startTop = node.scrollTop;
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dy = e.clientY - startY;
      if (!dragging && Math.abs(dy) < 5) return;
      dragging = true;
      node.scrollTop = startTop - dy;
      e.preventDefault();
    };
    const onUp = () => {
      down = false;
    };
    // Swallow the click that ends a drag so it doesn't press a button.
    const onClick = (e: MouseEvent) => {
      if (dragging) {
        e.stopPropagation();
        e.preventDefault();
        dragging = false;
      }
    };
    node.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    node.addEventListener('click', onClick, true);
    node.style.cursor = 'grab';
    return () => {
      node.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      node.removeEventListener('click', onClick, true);
    };
  }, [ref]);
}

/** Very soft pastel aura behind the composer; the sheet stays essentially white. */
function SoftGlow() {
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 100 100" width="100%">
        <Defs>
          <RadialGradient cx="50%" cy="50%" id="mint" r="50%">
            <Stop offset="0" stopColor="#B9F0D8" stopOpacity="0.55" />
            <Stop offset="1" stopColor="#B9F0D8" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient cx="50%" cy="50%" id="sky" r="50%">
            <Stop offset="0" stopColor="#C4DEFF" stopOpacity="0.6" />
            <Stop offset="1" stopColor="#C4DEFF" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient cx="50%" cy="50%" id="lilac" r="50%">
            <Stop offset="0" stopColor="#E3DAFF" stopOpacity="0.55" />
            <Stop offset="1" stopColor="#E3DAFF" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient cx="50%" cy="50%" id="top" r="50%">
            <Stop offset="0" stopColor="#E6F0FF" stopOpacity="0.45" />
            <Stop offset="1" stopColor="#E6F0FF" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect fill="#FFFFFF" height="100" width="100" x="0" y="0" />
        <Ellipse cx="30" cy="101" fill="url(#mint)" rx="34" ry="8" />
        <Ellipse cx="55" cy="100" fill="url(#sky)" rx="34" ry="7" />
        <Ellipse cx="80" cy="101" fill="url(#lilac)" rx="30" ry="8" />
      </Svg>
    </View>
  );
}

/** White at the top, fading to fully transparent at the bottom of the header. */
function HeaderFade() {
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 1 1" width="100%">
        <Defs>
          <LinearGradient id="hf" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
            <Stop offset="0.62" stopColor="#FFFFFF" stopOpacity="1" />
            <Stop offset="0.82" stopColor="#FFFFFF" stopOpacity="0.6" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect fill="url(#hf)" height="1" width="1" x="0" y="0" />
      </Svg>
    </View>
  );
}

/* -------------------------------------------------------------- drawer */

const BUTTON = 64;
const BUTTON_BOTTOM = 24; // toolbar bottom (20) + padding (4)
const MARGIN = 10;

export function AiChatDrawer({ onClosed }: { onClosed: () => void }) {
  const { width: sw, height: sh } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const W = Math.min(sw, 560) - MARGIN * 2;
  const H = Math.min(sh * 0.88, sh - insets.top - 24);

  // Keyboard: the card keeps its height; only the composer rises above it.
  const layerRef = useRef<ComponentRef<typeof View>>(null);
  const [gap, setGap] = useState(0); // space between the layer bottom and the screen bottom
  const [kb, setKb] = useState(0);
  const kbLift = Math.max(0, kb - gap - MARGIN);
  const lift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(show, (e) => setKb(e.endCoordinates.height));
    const b = Keyboard.addListener(hide, () => setKb(0));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  useEffect(() => {
    Animated.timing(lift, {
      toValue: -kbLift,
      duration: Platform.OS === 'ios' ? 260 : 200,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      useNativeDriver: false,
    }).start();
    if (kbLift) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  }, [kbLift, lift]);

  const open = useRef(new Animated.Value(0)).current;
  const historyAnim = useRef(new Animated.Value(0)).current;

  const [chats, setChats] = useState<Chat[]>(SEED);
  const [activeId, setActiveId] = useState<string | null>('c1');
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [streaming, setStreaming] = useState<{ id: string; full: string; shown: number } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyMounted, setHistoryMounted] = useState(false);
  const [headerH, setHeaderH] = useState(64);
  const [historyQuery, setHistoryQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [opened, setOpened] = useState(false);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  useMouseDragScroll(scrollRef);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const active = chats.find((c) => c.id === activeId) ?? null;
  const messages = active?.messages ?? [];
  const busy = thinking || !!streaming;

  useEffect(() => {
    // A smooth ease-out (no wobble): the button blooms into the card and settles.
    Animated.timing(open, {
      toValue: 1,
      duration: 560,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: false,
    }).start(() => setOpened(true));
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, [open]);

  // Swipe down on the handle/header to dismiss, like a native bottom sheet.
  const drag = useRef(new Animated.Value(0)).current;

  // Same exit for every way of closing (button, scrim, back, swipe): the card
  // folds back into the AI button. Any drag offset glides home at the same time.
  const close = useCallback(() => {
    Keyboard.dismiss();
    setOpened(false);
    const timing = { duration: 420, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: false };
    Animated.parallel([
      Animated.timing(open, { toValue: 0, ...timing }),
      Animated.timing(drag, { toValue: 0, ...timing }),
    ]).start(() => onClosed());
  }, [drag, onClosed, open]);
  const sheetH = useRef(H);
  sheetH.current = H;
  const dragPan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onMoveShouldSetPanResponderCapture: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
        onPanResponderGrant: () => Keyboard.dismiss(),
        onPanResponderMove: (_, g) => {
          // Follow the finger downward; resist a little when pulled up.
          drag.setValue(g.dy > 0 ? g.dy : g.dy / 6);
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy > sheetH.current * 0.22 || g.vy > 1.1) {
            close();
          } else {
            Animated.spring(drag, { toValue: 0, damping: 20, stiffness: 260, useNativeDriver: false }).start();
          }
        },
        onPanResponderTerminate: () =>
          Animated.spring(drag, { toValue: 0, damping: 20, stiffness: 260, useNativeDriver: false }).start(),
      }),
    [close, drag]
  );

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showHistory) setShowHistory(false);
      else close();
      return true;
    });
    return () => sub.remove();
  }, [close, showHistory]);

  useEffect(() => {
    if (showHistory) setHistoryMounted(true);
    Animated.spring(historyAnim, {
      toValue: showHistory ? 1 : 0,
      damping: 24,
      stiffness: 240,
      useNativeDriver: Platform.OS !== 'web',
    }).start(({ finished }) => {
      if (finished && !showHistory) setHistoryMounted(false);
    });
  }, [historyAnim, showHistory]);

  const flash = (t: string) => {
    setToast(t);
    timers.current.push(setTimeout(() => setToast(null), 1600));
  };

  const updateChat = (id: string, fn: (c: Chat) => Chat) => setChats((cs) => cs.map((c) => (c.id === id ? fn(c) : c)));

  // Reveal the reply word by word, like a streamed response.
  useEffect(() => {
    if (!streaming || !activeId) return;
    if (streaming.shown >= streaming.full.length) {
      setStreaming(null);
      return;
    }
    const t = setTimeout(() => {
      const next = streaming.full.indexOf(' ', streaming.shown + 1);
      const shown = next === -1 ? streaming.full.length : next;
      updateChat(activeId, (c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === streaming.id ? { ...m, text: streaming.full.slice(0, shown) } : m)),
      }));
      setStreaming({ ...streaming, shown });
      scrollRef.current?.scrollToEnd({ animated: false });
    }, 28);
    return () => clearTimeout(t);
  }, [streaming, activeId]);

  const respond = (chatId: string, prompt: string) => {
    setThinking(true);
    timers.current.push(
      setTimeout(() => {
        const id = uid();
        const full = mockReply(prompt);
        updateChat(chatId, (c) => ({ ...c, messages: [...c.messages, { id, role: 'ai', text: '', time: now() }] }));
        setThinking(false);
        setStreaming({ id, full, shown: 0 });
      }, 900)
    );
  };

  const send = (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    setInput('');
    let id = activeId;
    const msg: Msg = { id: uid(), role: 'user', text, time: now() };
    if (!id) {
      id = `c${Date.now()}`;
      const title = text.length > 34 ? `${text.slice(0, 34)}…` : text;
      setChats((cs) => [{ id: id!, title, group: 'Today', messages: [msg] }, ...cs]);
      setActiveId(id);
    } else {
      updateChat(id, (c) => ({ ...c, messages: [...c.messages, msg] }));
    }
    respond(id, text);
    timers.current.push(setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60));
  };

  const stop = () => {
    timers.current.forEach(clearTimeout);
    setThinking(false);
    setStreaming(null);
  };

  const regenerate = (msgId: string) => {
    if (!active || busy) return;
    const idx = active.messages.findIndex((m) => m.id === msgId);
    const prompt = [...active.messages.slice(0, idx)].reverse().find((m) => m.role === 'user')?.text ?? '';
    updateChat(active.id, (c) => ({ ...c, messages: c.messages.slice(0, idx) }));
    respond(active.id, prompt);
  };

  const rate = (msgId: string, r: 'up' | 'down') => {
    if (!active) return;
    updateChat(active.id, (c) => ({
      ...c,
      messages: c.messages.map((m) => (m.id === msgId ? { ...m, rating: m.rating === r ? undefined : r } : m)),
    }));
    flash(r === 'up' ? 'Thanks for the feedback' : 'Got it — we’ll improve this');
  };

  const newChat = () => {
    stop();
    setActiveId(null);
    setShowHistory(false);
  };

  const groups = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    const list = chats.filter((c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => m.text.toLowerCase().includes(q)));
    return (['Today', 'Yesterday', 'Previous 7 days'] as const)
      .map((g) => ({ g, items: list.filter((c) => c.group === g) }))
      .filter((x) => x.items.length);
  }, [chats, historyQuery]);

  /* ---- morph: circle at the AI button → floating card ---- */
  const p = open;
  // Widens first, then grows tall: reads as the button stretching into a sheet.
  const width = p.interpolate({ inputRange: [0, 0.55, 1], outputRange: [BUTTON, W * 0.97, W], extrapolate: 'clamp' });
  const height = p.interpolate({ inputRange: [0, 0.2, 1], outputRange: [BUTTON, BUTTON * 1.4, H], extrapolate: 'clamp' });
  const bottom = p.interpolate({ inputRange: [0, 1], outputRange: [BUTTON_BOTTOM, MARGIN] });
  const radius = p.interpolate({ inputRange: [0, 0.35, 1], outputRange: [BUTTON / 2, 30, 30], extrapolate: 'clamp' });
  // Starts see-through so only the hex shows, exactly like the resting button.
  const surface = p.interpolate({ inputRange: [0, 0.14], outputRange: ['rgba(255,255,255,0)', 'rgba(255,255,255,1)'], extrapolate: 'clamp' });
  const shadowOpacity = p.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.12, 0.22], extrapolate: 'clamp' });
  // The AI mark grows slightly and fades as the card opens around it.
  const ink = p.interpolate({ inputRange: [0, 0.12, 0.42], outputRange: [1, 1, 0], extrapolate: 'clamp' });
  const inkScale = p.interpolate({ inputRange: [0, 0.42], outputRange: [1, 1.35], extrapolate: 'clamp' });
  const content = p.interpolate({ inputRange: [0, 0.38, 0.85], outputRange: [0, 0, 1], extrapolate: 'clamp' });
  const contentY = p.interpolate({ inputRange: [0.38, 1], outputRange: [26, 0], extrapolate: 'clamp' });
  const contentScale = p.interpolate({ inputRange: [0.38, 1], outputRange: [0.97, 1], extrapolate: 'clamp' });
  const scrimOpen = p.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const scrimDrag = drag.interpolate({ inputRange: [0, H], outputRange: [1, 0], extrapolate: 'clamp' });
  const scrim = Animated.multiply(scrimOpen, scrimDrag);

  // Chat and history share the drawer: a quick crossfade with a short slide.
  const chatOpacity = historyAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0], extrapolate: 'clamp' });
  const chatX = historyAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -28], extrapolate: 'clamp' });
  const histOpacity = historyAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const histX = historyAnim.interpolate({ inputRange: [0, 1], outputRange: [28, 0], extrapolate: 'clamp' });
  const lastAi = [...messages].reverse().find((m) => m.role === 'ai');

  return (
    <View
      onLayout={() => layerRef.current?.measureInWindow((_x, y, _w, h) => setGap(Math.max(0, sh - (y + h))))}
      ref={layerRef}
      style={styles.layer}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: scrim }]}>
        <Pressable accessibilityLabel="Close AI chat" onPress={close} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <Animated.View
        style={[
          styles.morph,
          { width, height, bottom, borderRadius: radius, backgroundColor: surface, shadowOpacity, transform: [{ translateY: drag }] },
        ]}>
        <View style={[styles.card, { width: W, height: H }]}>
          <SoftGlow />
          <Animated.View style={[styles.fill, { opacity: content, transform: [{ translateY: contentY }, { scale: contentScale }] }]}>
            {/* chat page */}
            <Animated.View
              style={[styles.page, { opacity: chatOpacity, transform: [{ translateX: chatX }], pointerEvents: showHistory ? 'none' : 'auto' }]}>
            {/* conversation */}
            <ScrollView
              contentContainerStyle={[styles.thread, { paddingTop: headerH + 4, paddingBottom: 16 + kbLift }]}
              keyboardDismissMode="interactive"
              nestedScrollEnabled
              style={styles.threadScroll}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => !streaming && scrollRef.current?.scrollToEnd({ animated: false })}
              ref={scrollRef}
              showsVerticalScrollIndicator={false}>
              {!messages.length ? (
                <View style={styles.empty}>
                  <AiMark size={76} />
                  <Text style={styles.emptyTitle}>How can I help you build today?</Text>
                  <Text style={styles.emptySub}>Ask me to create, fix, or explain any workflow on your canvas.</Text>
                  <View style={styles.suggestGrid}>
                    {SUGGESTIONS.map((s) => (
                      <Pressable key={s.text} onPress={() => send(s.text)} style={({ pressed }) => [styles.suggest, pressed && styles.pressed]}>
                        <IconifyIcon color="#55565B" name={s.icon} size={16} />
                        <Text style={styles.suggestText}>{s.text}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : (
                <>
                  {messages.map((m) =>
                    m.role === 'user' ? (
                      <View key={m.id} style={styles.userWrap}>
                        <View style={styles.userBubble}>
                          <Text style={[styles.msgText, { color: '#1B1C1E' }]}>{m.text}</Text>
                        </View>
                      </View>
                    ) : (
                      <View key={m.id} style={styles.aiWrap}>
                        <View style={styles.aiBody}>
                          <RichText color="#1B1C1E" text={m.text || ' '} />
                          {streaming?.id !== m.id && m.id === lastAi?.id ? (
                            <View style={styles.actions}>
                              <Pressable accessibilityLabel="Share" onPress={() => Share.share({ message: m.text }).catch(() => {})} style={styles.action}>
                                <IconifyIcon color="#A3A4A8" name="lucide:share" size={14} />
                              </Pressable>
                              <Pressable accessibilityLabel="Good response" onPress={() => rate(m.id, 'up')} style={styles.action}>
                                <IconifyIcon color={m.rating === 'up' ? '#141518' : '#A3A4A8'} name="lucide:thumbs-up" size={14} />
                              </Pressable>
                              <Pressable accessibilityLabel="Bad response" onPress={() => rate(m.id, 'down')} style={styles.action}>
                                <IconifyIcon color={m.rating === 'down' ? '#141518' : '#A3A4A8'} name="lucide:thumbs-down" size={14} />
                              </Pressable>
                              <Pressable accessibilityLabel="Regenerate" onPress={() => regenerate(m.id)} style={styles.action}>
                                <IconifyIcon color="#A3A4A8" name="lucide:refresh-cw" size={14} />
                              </Pressable>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    )
                  )}
                  {thinking ? (
                    <View style={styles.aiWrap}>
                      <TypingDots />
                    </View>
                  ) : null}
                </>
              )}
            </ScrollView>

            {/* composer */}
            <Animated.View style={[styles.composerWrap, kbLift > 0 && styles.composerLifted, { transform: [{ translateY: lift }] }]}>
              {kbLift > 0 ? <View style={[styles.composerSkirt, { pointerEvents: 'none' }]} /> : null}
              <View style={[styles.composer, focused && styles.composerFocused]}>
                <TextInput
                  multiline
                  onBlur={() => setFocused(false)}
                  onChangeText={setInput}
                  onFocus={() => setFocused(true)}
                  onSubmitEditing={() => send()}
                  numberOfLines={Platform.OS === 'web' ? 1 : undefined}
                  placeholder="Ask Vyn AI"
                  placeholderTextColor="#9C9DA1"
                  style={styles.input}
                  submitBehavior="blurAndSubmit"
                  textAlignVertical="center"
                  value={input}
                />
                {busy ? (
                  <Pressable accessibilityLabel="Stop generating" onPress={stop} style={styles.sendBtn}>
                    <View style={styles.stopSquare} />
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityLabel="Send"
                    disabled={!input.trim()}
                    onPress={() => send()}
                    style={({ pressed }) => [styles.sendBtn, !input.trim() && styles.sendOff, pressed && styles.pressed]}>
                    <IconifyIcon color={input.trim() ? '#FFFFFF' : '#8A8B90'} name="lucide:arrow-up" size={18} />
                  </Pressable>
                )}
              </View>
            </Animated.View>
            </Animated.View>

            {/* history page (same drawer, replaces the chat) */}
            {historyMounted ? (
              <Animated.View
                style={[styles.page, styles.pageAbs, { opacity: histOpacity, transform: [{ translateX: histX }], pointerEvents: showHistory ? 'auto' : 'none' }]}>
                <ScrollView
                  contentContainerStyle={[styles.historyList, { paddingTop: headerH + 2 }]}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  style={{ flex: 1 }}>
                  <View style={[styles.search, searchFocused && styles.searchFocused]}>
                    <IconifyIcon color={searchFocused ? '#141518' : '#A3A4A8'} name="lucide:search" size={16} />
                    <TextInput
                      onBlur={() => setSearchFocused(false)}
                      onChangeText={setHistoryQuery}
                      onFocus={() => setSearchFocused(true)}
                      placeholder="Search chats"
                      placeholderTextColor="#A3A4A8"
                      returnKeyType="search"
                      style={styles.searchInput}
                      value={historyQuery}
                    />
                    {historyQuery ? (
                      <Pressable accessibilityLabel="Clear search" hitSlop={10} onPress={() => setHistoryQuery('')} style={styles.searchClear}>
                        <IconifyIcon color="#FFFFFF" name="lucide:x" size={11} />
                      </Pressable>
                    ) : null}
                  </View>

                  {groups.map(({ g, items }) => (
                    <View key={g} style={styles.group}>
                      <Text style={styles.groupLabel}>{g}</Text>
                      {items.map((c, idx) => {
                        const on = c.id === activeId;
                        const last = c.messages[c.messages.length - 1];
                        return (
                          <Pressable
                            key={c.id}
                            onPress={() => {
                              stop();
                              setActiveId(c.id);
                              setShowHistory(false);
                            }}
                            style={({ pressed }) => [styles.histItem, idx > 0 && styles.histDivider, pressed && styles.histItemPressed]}>
                            <View style={[styles.histDot, on && styles.histDotOn]} />
                            <View style={{ flex: 1 }}>
                              <View style={styles.histTop}>
                                <Text numberOfLines={1} style={styles.histTitle}>{c.title}</Text>
                                <Text style={styles.histWhen}>{last?.time}</Text>
                              </View>
                              <Text numberOfLines={1} style={styles.histSub}>
                                {last?.text.replace(/[*`]/g, '').replace(/\n+/g, ' ')}
                              </Text>
                            </View>
                            <Pressable
                              accessibilityLabel="Delete chat"
                              hitSlop={8}
                              onPress={() => {
                                setChats((cs) => cs.filter((x) => x.id !== c.id));
                                if (on) setActiveId(null);
                                flash('Chat deleted');
                              }}
                              style={styles.histDelete}>
                              <IconifyIcon color="#B8B9BD" name="lucide:trash" size={14} />
                            </Pressable>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                  {!groups.length ? (
                    <View style={styles.noResults}>
                      <IconifyIcon color="#C6C7CA" name="lucide:search" size={22} />
                      <Text style={styles.noResultsText}>No chats found</Text>
                    </View>
                  ) : null}
                </ScrollView>
              </Animated.View>
            ) : null}

            {/* header overlay: fades into the content scrolling beneath it */}
            <View
              {...dragPan.panHandlers}
              onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
              style={styles.headerOverlay}>
              <HeaderFade />
              <View style={styles.grabber} />
              <View style={styles.header}>
                {showHistory ? (
                  <>
                    <Pressable accessibilityLabel="Back to chat" onPress={() => setShowHistory(false)} style={styles.iconBtn}>
                      <IconifyIcon color="#1B1C1E" name="lucide:chevron-left" size={22} />
                    </Pressable>
                    <Text style={styles.title}>History</Text>
                  </>
                ) : (
                  <>
                    <Pressable accessibilityLabel="Chat history" onPress={() => setShowHistory(true)} style={styles.iconBtn}>
                      <IconifyIcon color="#1B1C1E" name="lucide:rotate-ccw-clock" size={19} />
                    </Pressable>
                    <View style={styles.headerMid}>
                      <AiMark size={28} />
                      <Text style={styles.title}>Vyn AI</Text>
                    </View>
                  </>
                )}
                <View style={styles.headerRight}>
                  <Pressable accessibilityLabel="New chat" onPress={newChat} style={styles.iconBtn}>
                    <IconifyIcon color="#1B1C1E" name="lucide:square-pen" size={18} />
                  </Pressable>
                  <Pressable accessibilityLabel="Close" onPress={close} style={styles.iconBtn}>
                    <IconifyIcon color="#1B1C1E" name="lucide:x" size={19} />
                  </Pressable>
                </View>
              </View>
            </View>

            {toast ? (
              <View style={[styles.toast, { pointerEvents: 'none' }]}>
                <Text style={styles.toastText}>{toast}</Text>
              </View>
            ) : null}
          </Animated.View>
        </View>

        {/* The black AI button the card grows out of. */}
        {/* Removed once open so it can never sit over the chat and block touches. */}
        {!opened ? (
          <Animated.View style={[styles.ink, { opacity: ink, transform: [{ scale: inkScale }] }]}>
            <AiMark size={BUTTON} />
          </Animated.View>
        ) : null}
      </Animated.View>
    </View>
  );
}

/* --------------------------------------------------------------- styles */

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, zIndex: 120, elevation: 120, alignItems: 'center' },
  scrim: { backgroundColor: 'rgba(14,15,17,0.38)' },
  morph: {
    position: 'absolute',
    alignSelf: 'center',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0B0C0E',
    shadowOpacity: 0.22,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 18 },
    elevation: 30,
  },
  card: { position: 'absolute', bottom: 0 },
  fill: { flex: 1 },
  ink: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#DCDCD8', marginTop: 9 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingTop: 6, paddingBottom: 6 },
  headerMid: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerRight: { flexDirection: 'row', gap: 0 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: '#141518', letterSpacing: -0.4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2BB673' },
  status: { fontSize: 11, color: '#8A8B90', fontWeight: '500' },
  thread: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20, gap: 26, flexGrow: 1 },
  dayLabel: { alignSelf: 'center', fontSize: 11, fontWeight: '600', color: '#A3A4A8', letterSpacing: 0.4, textTransform: 'uppercase' },
  userWrap: { alignItems: 'flex-end', gap: 4 },
  userBubble: { maxWidth: '80%', backgroundColor: '#F2F3F5', paddingHorizontal: 16, paddingVertical: 11, borderRadius: 22, borderBottomRightRadius: 8 },
  time: { fontSize: 10.5, color: '#A9AAAE', marginRight: 4 },
  aiWrap: { flexDirection: 'row', alignItems: 'flex-start' },
  aiAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F4F4F2', alignItems: 'center', justifyContent: 'center' },
  aiBody: { flex: 1 },
  msgText: { fontSize: 15, lineHeight: 23, letterSpacing: -0.15 },
  code: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 12.5, backgroundColor: '#F1F1EF', color: '#3A3B40' },
  listRow: { flexDirection: 'row', gap: 8 },
  listMark: { fontSize: 14.5, lineHeight: 21, fontWeight: '600', minWidth: 14 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 10, marginLeft: -7 },
  action: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  timeAi: { fontSize: 10.5, color: '#A9AAAE', marginLeft: 6 },
  typing: { flexDirection: 'row', gap: 5, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, backgroundColor: '#F4F4F2' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#55565B' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 20 },
  emptyTitle: { marginTop: 18, fontSize: 21, fontWeight: '700', color: '#141518', letterSpacing: -0.6, textAlign: 'center' },
  emptySub: { marginTop: 6, fontSize: 13.5, color: '#8A8B90', textAlign: 'center', lineHeight: 19, maxWidth: 280 },
  suggestGrid: { marginTop: 22, flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  suggest: { width: '48%', minHeight: 64, padding: 12, gap: 8, borderRadius: 18, borderWidth: 1, borderColor: '#EDEEF1', backgroundColor: 'rgba(255,255,255,0.8)' },
  suggestText: { fontSize: 12.5, fontWeight: '600', color: '#2A2B2F', lineHeight: 17 },
  pressed: { opacity: 0.6, transform: [{ scale: 0.98 }] },
  threadScroll: { flex: 1 },
  composerWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14, backgroundColor: 'transparent' },
  composerLifted: { paddingTop: 10, backgroundColor: 'rgba(255,255,255,0.94)' },
  composerSkirt: { position: 'absolute', left: 0, right: 0, top: '100%', height: 800, backgroundColor: 'rgba(255,255,255,0.94)' },
  quickRow: { gap: 6, paddingBottom: 10, paddingHorizontal: 2 },
  quick: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 30, borderRadius: 15, backgroundColor: '#F4F4F2' },
  quickText: { fontSize: 12, fontWeight: '600', color: '#4A4B50' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    minHeight: 50,
    paddingLeft: 18,
    paddingRight: 7,
    paddingVertical: 7,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E9EAED',
  },
  composerFocused: { borderColor: '#D5D8DE' },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 36,
    paddingTop: Platform.OS === 'ios' ? 9 : 6,
    paddingBottom: Platform.OS === 'ios' ? 9 : 6,
    fontSize: 15.5,
    lineHeight: 20,
    color: '#141518',
    outlineStyle: 'none',
  } as object,
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#141518', alignItems: 'center', justifyContent: 'center' },
  sendOff: { backgroundColor: '#F1F2F4' },
  stopSquare: { width: 12, height: 12, borderRadius: 3, backgroundColor: '#FFFFFF' },
  disclaimer: { textAlign: 'center', fontSize: 10.5, color: '#B4B5B9', marginTop: 8 },
  headerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: 22, zIndex: 10 },
  page: { flex: 1 },
  pageAbs: { ...StyleSheet.absoluteFill },
  search: { flexDirection: 'row', alignItems: 'center', gap: 9, height: 44, marginHorizontal: 16, paddingHorizontal: 14, borderRadius: 22, backgroundColor: '#F4F5F7', borderWidth: 1, borderColor: 'transparent' },
  searchFocused: { backgroundColor: '#FFFFFF', borderColor: '#E1E3E7' },
  searchInput: { flex: 1, height: '100%', fontSize: 15, color: '#141518', paddingVertical: 0, outlineStyle: 'none' } as object,
  searchClear: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#B5B6BA', alignItems: 'center', justifyContent: 'center' },
  historyList: { paddingBottom: 28 },
  group: { marginTop: 22, marginHorizontal: 16 },
  groupLabel: { marginBottom: 2, marginLeft: 4, fontSize: 12, fontWeight: '600', color: '#A3A4A8', letterSpacing: 0.2 },
  histItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4, paddingVertical: 14 },
  histDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ECEDF0' },
  histItemPressed: { opacity: 0.55 },
  histDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'transparent' },
  histDotOn: { backgroundColor: '#141518' },
  histTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  histTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1B1C1E', letterSpacing: -0.25 },
  histWhen: { fontSize: 12, color: '#AEAFB3' },
  histSub: { fontSize: 13, color: '#9A9B9F', marginTop: 3 },
  histDelete: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  noResults: { marginTop: 56, alignItems: 'center', gap: 8 },
  noResultsText: { color: '#9A9B9F', fontSize: 13 },
  toast: { position: 'absolute', alignSelf: 'center', bottom: 120, backgroundColor: '#141518', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18 },
  toastText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '600' },
});

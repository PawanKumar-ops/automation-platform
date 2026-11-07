import { Fragment, useEffect, useMemo, useState } from 'react';
import {
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    useWindowDimensions,
    View,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiMark } from '@/components/ai-mark';
import { BOTTOM_NAV_SPACE, BottomNav } from '@/components/bottom-nav';
import { FEATURE_COLORS, FeatureKind, FeatureMark } from '@/components/feature-mark';
import { IconifyIcon } from '@/components/iconify-icon';
import { Fonts } from '@/constants/theme';

const HERO_ASPECT = 1200 / 934;
const HEADER_HEIGHT = 56;
const HERO_GAP = 60;
const PROMPT_HEIGHT = 150;

type IconName = `${string}:${string}`;

type Template = {
    id: string;
    title: string;
    description: string;
    icons: IconName[];
    tint: string;
    used: string;
};

const FEATURED_SERVICE = {
    label: 'AI Agent',
    detail: 'Describe a goal and let an agent plan, run, and refine it for you.',
    icon: 'lucide:sparkles' as IconName,
};

const SERVICES: { kind: FeatureKind; label: string; short: string; detail: string }[] = [
    { kind: 'tables', label: 'Tables', short: 'Structured data', detail: 'Store and shape the data your workflows run on.' },
    { kind: 'mcp', label: 'MCP', short: 'Connect any tool', detail: 'Plug any tool or API into your agents.' },
    { kind: 'forms', label: 'Forms', short: 'Collect input', detail: 'Collect input that kicks off automations.' },
];

const TEMPLATES: Template[] = [
    {
        id: 'social',
        title: 'Post a message with a new tweet from a watched Twitter account in Discord',
        description:
            'Elevate your Telegram channel with our ChatGPT-powered bot. Deliver instant, smart responses to user queries.',
        icons: ['simple-icons:x', 'logos:discord-icon'],
        tint: '#EEF0FB',
        used: '1066',
    },
    {
        id: 'research',
        title: 'Find YouTube videos by keywords, summarize with ChatGPT, and email the results',
        description:
            'Discover relevant YouTube videos using keyword search, get concise summaries with ChatGPT, and receive them by email.',
        icons: ['logos:youtube-icon', 'logos:google-ads', 'logos:google-gmail', 'logos:openai-icon', 'logos:google-sheets'],
        tint: '#F8E9EC',
        used: '5092',
    },
    {
        id: 'transcribe',
        title: 'Transcribe audio files from Google Drive using OpenAI Whisper',
        description:
            'Easily transcribe audio files stored on Google Drive with OpenAI Whisper, automate transcription, store on a Google Doc and instantly share it.',
        icons: ['logos:google-drive-2020', 'logos:openai-icon', 'logos:google-gmail'],
        tint: '#E9EEEA',
        used: '2117',
    },
    {
        id: 'support',
        title: 'Turn new support messages into organized Linear tasks',
        description:
            'Classify incoming Slack requests with AI, create a Linear issue, and log every update to Notion automatically.',
        icons: ['logos:slack-icon', 'logos:linear-icon', 'logos:notion-icon'],
        tint: '#F3F0E8',
        used: '3841',
    },
];

const WORKFLOWS: {
    name: string;
    meta: string;
    icons: IconName[];
    state: 'Draft' | 'Active';
    progress?: number;
    runs?: string;
}[] = [
        {
            name: 'Content research assistant',
            meta: 'Edited 12 min ago',
            icons: ['logos:youtube-icon', 'logos:openai-icon'],
            state: 'Draft',
            progress: 0.6,
        },
        {
            name: 'Lead qualification',
            meta: 'Edited yesterday',
            icons: ['logos:google-gmail', 'logos:hubspot'],
            state: 'Draft',
            progress: 0.3,
        },
        {
            name: 'Daily team brief',
            meta: 'Ran 8 min ago',
            icons: ['logos:slack-icon', 'logos:notion-icon'],
            state: 'Active',
            runs: '142 runs',
        },
        {
            name: 'Customer feedback routing',
            meta: 'Ran 1 hr ago',
            icons: ['logos:discord-icon', 'logos:linear-icon'],
            state: 'Active',
            runs: '38 runs',
        },
    ];

function FeatureCard({
    service,
    compact,
    onPress,
}: {
    service: (typeof SERVICES)[number];
    compact: boolean;
    onPress: () => void;
}) {
    return (
        <Pressable
            accessibilityLabel={`${service.label}: ${service.detail}`}
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => [styles.featureCard, pressed && styles.featureCardPressed]}>
            <FeatureMark kind={service.kind} size={compact ? 40 : 46} />
            <Text numberOfLines={1} style={styles.featureTitle}>
                {service.label}
            </Text>
            <Text numberOfLines={1} style={styles.featureDetail}>
                {service.short}
            </Text>
        </Pressable>
    );
}

function SectionHeading({ title, action }: { title: string; action?: string }) {
    return (
        <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>{title}</Text>
            {action ? (
                <Pressable accessibilityRole="button" hitSlop={8} style={styles.sectionActionButton}>
                    <Text style={styles.sectionAction}>{action}</Text>
                    <IconifyIcon color="#8A8A85" name="lucide:chevron-right" size={15} />
                </Pressable>
            ) : null}
        </View>
    );
}

function IconStack({ icons, size = 30 }: { icons: IconName[]; size?: number }) {
    return (
        <View style={styles.iconStack}>
            {icons.slice(0, 3).map((icon, index) => (
                <View
                    key={icon}
                    style={[
                        styles.appIcon,
                        { height: size, width: size, borderRadius: size / 2 },
                        index > 0 && { marginLeft: -7 },
                    ]}>
                    <IconifyIcon name={icon} size={Math.round(size * 0.52)} />
                </View>
            ))}
            {icons.length > 3 ? <Text style={styles.moreIcons}>+{icons.length - 3}</Text> : null}
        </View>
    );
}

function TemplateCard({
    card,
    width,
    dark,
    onStart,
}: {
    card: Template;
    width: number;
    dark?: boolean;
    onStart: (title: string) => void;
}) {
    const visible = card.icons.length > 4 ? card.icons.slice(0, 3) : card.icons;
    const extra = card.icons.length - visible.length;
    return (
        <View style={[styles.templateCard, { backgroundColor: card.tint, width }]}>
            <View style={styles.templateMain}>
                <View style={styles.templateIcons}>
                    {visible.map((icon, index) => (
                        <View key={icon} style={[styles.templateIcon, index > 0 && styles.templateIconOverlap]}>
                            <IconifyIcon color="#111111" name={icon} size={22} />
                        </View>
                    ))}
                    {extra > 0 ? (
                        <View style={[styles.templateIcon, styles.templateIconOverlap]}>
                            <Text style={styles.templateMore}>+{extra}</Text>
                        </View>
                    ) : null}
                </View>
                <View style={styles.templateCopy}>
                    <Text numberOfLines={4} style={styles.templateTitle}>
                        {card.title}
                    </Text>
                    <Text numberOfLines={3} style={styles.templateDescription}>
                        {card.description}
                    </Text>
                </View>
            </View>
            <View style={styles.templateFooter}>
                <View style={styles.usedBadge}>
                    <Text style={styles.usedLabel}>Used</Text>
                    <Text style={styles.usedValue}>{card.used}</Text>
                </View>
                <Pressable
                    accessibilityLabel={`Start ${card.title}`}
                    accessibilityRole="button"
                    onPress={() => onStart(card.title)}
                    style={({ pressed }) => [styles.startButton, dark && styles.startButtonDark, pressed && styles.pressed]}>
                    <Text style={[styles.startButtonText, dark && styles.startButtonTextDark]}>Start</Text>
                    <IconifyIcon color={dark ? '#FFFFFF' : '#1D1D1F'} name="lucide:play" size={15} />
                </Pressable>
            </View>
        </View>
    );
}

function WorkflowRow({
    workflow,
    last,
    onOpen,
}: {
    workflow: (typeof WORKFLOWS)[number];
    last?: boolean;
    onOpen: (name: string) => void;
}) {
    const active = workflow.state === 'Active';
    return (
        <Pressable
            accessibilityRole="button"
            onPress={() => onOpen(workflow.name)}
            style={({ pressed }) => [styles.workflowRow, pressed && styles.rowPressed]}>
            <IconStack icons={workflow.icons} size={34} />
            <View style={[styles.workflowBody, !last && styles.workflowBodyDivider]}>
                <View style={styles.workflowCopy}>
                    <Text numberOfLines={1} style={styles.workflowName}>
                        {workflow.name}
                    </Text>
                    {active ? (
                        <View style={styles.workflowMetaRow}>
                            <View style={styles.liveDot} />
                            <Text style={styles.workflowLive}>Live</Text>
                            <Text style={styles.workflowMeta}> · {workflow.meta} · {workflow.runs}</Text>
                        </View>
                    ) : (
                        <View style={styles.workflowMetaRow}>
                            <Text style={styles.workflowMeta}>{workflow.meta}</Text>
                        </View>
                    )}
                </View>
                <IconifyIcon
                    color={active ? '#A0A09D' : '#292927'}
                    name={active ? 'lucide:chevron-right' : 'lucide:arrow-up-right'}
                    size={16}
                />
            </View>
        </Pressable>
    );
}

export function Dashboard() {
    const insets = useSafeAreaInsets();
    const window = useWindowDimensions();
    // Static web rendering has no real window size; use a phone width until hydrated.
    const [hydrated, setHydrated] = useState(false);
    useEffect(() => setHydrated(true), []);
    const width = hydrated ? window.width : 390;
    const compact = width < 680;
    const gutter = compact ? 16 : 32;
    const cardWidth = compact ? Math.min(width - 54, 330) : 346;
    const [prompt, setPrompt] = useState('');
    const [notice, setNotice] = useState('AI can make mistakes. Please verify important information.');
    const topPadding = Math.max(insets.top, 16);
    // Image fade completes exactly at the vertical middle of the prompt card.
    const heroImageHeight = topPadding + HEADER_HEIGHT + HERO_GAP + PROMPT_HEIGHT / 2;
    // Render at the photo's aspect ratio and shift up so only the top is clipped and the fade stays intact.
    const heroRenderHeight = Math.max(width / HERO_ASPECT, heroImageHeight);

    const groupedWorkflows = useMemo(
        () => ({
            drafts: WORKFLOWS.filter((workflow) => workflow.state === 'Draft'),
            active: WORKFLOWS.filter((workflow) => workflow.state === 'Active'),
        }),
        []
    );

    const submitPrompt = () => {
        const cleanPrompt = prompt.trim();
        if (!cleanPrompt) return;
        setNotice(`Drafting “${cleanPrompt.length > 42 ? `${cleanPrompt.slice(0, 42)}…` : cleanPrompt}”`);
        setPrompt('');
    };

    return (
        <View style={styles.screen}>
            <ScrollView
                contentContainerStyle={[
                    styles.page,
                    {
                        paddingBottom: Math.max(insets.bottom, 10) + BOTTOM_NAV_SPACE - 2,
                        paddingTop: topPadding,
                    },
                ]}
                showsVerticalScrollIndicator={false}>
                <Image
                    accessible={false}
                    contentFit="cover"
                    source={require('@/assets/images/dashboard-hero.webp')}
                    style={[styles.heroImage, { height: heroRenderHeight, top: heroImageHeight - heroRenderHeight }]}
                />
                <View style={[styles.content, { paddingHorizontal: gutter }]}>
                    <View style={styles.header}>
                        <Pressable
                            accessibilityLabel="Taskvyn home"
                            accessibilityRole="button"
                            style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}>
                            <Image
                                contentFit="contain"
                                source={require('@/assets/taskvyn.icon/black.svg')}
                                style={{ height: 34, width: 34 }}
                            />
                        </Pressable>
                        <View style={styles.headerActions}>
                            <Pressable
                                accessibilityLabel="Open AI assistant"
                                accessibilityRole="button"
                                style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}>
                                <AiMark animated={false} size={34} />
                            </Pressable>
                            <Pressable
                                accessibilityLabel="Open profile"
                                accessibilityRole="button"
                                style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}>
                                <Text style={styles.avatarText}>AK</Text>
                            </Pressable>
                        </View>
                    </View>

                    <View style={[styles.hero, { paddingTop: HERO_GAP }]}>
                        <View style={styles.promptCard}>
                            <TextInput
                                accessibilityLabel="Describe a workflow"
                                multiline
                                onChangeText={setPrompt}
                                onSubmitEditing={submitPrompt}
                                placeholder="Describe a workflow to automate..."
                                placeholderTextColor="#9A9A96"
                                returnKeyType="send"
                                style={[styles.promptInput, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
                                value={prompt}
                            />
                            <View style={styles.promptToolbar}>
                                <View style={styles.promptChip}>
                                    <AiMark animated={false} size={16} />
                                    <Text style={styles.promptChipText}>Taskvyn AI</Text>
                                </View>
                                <Pressable
                                    accessibilityLabel="Create workflow"
                                    accessibilityRole="button"
                                    disabled={!prompt.trim()}
                                    onPress={submitPrompt}
                                    style={({ pressed }) => [
                                        styles.sendButton,
                                        !prompt.trim() && styles.sendButtonDisabled,
                                        pressed && prompt.trim() && styles.pressed,
                                    ]}>
                                    <IconifyIcon color="#FFFFFF" name="lucide:arrow-up" size={18} />
                                </Pressable>
                            </View>
                        </View>
                        <Text style={styles.promptStatus}>
                            AI can make mistakes. Please verify important information.
                        </Text>
                    </View>

                    <View style={styles.section}>
                        <SectionHeading title="Explore Taskvyn" />
                        <View style={[styles.serviceLayout, compact && styles.serviceLayoutCompact]}>
                            <Pressable
                                accessibilityRole="button"
                                onPress={() => setNotice(`${FEATURED_SERVICE.label} selected`)}
                                style={[
                                    styles.featuredCard,
                                    !compact && styles.featuredCardWide,
                                ]}>
                                <View style={styles.featuredGlow} />
                                <View style={styles.featuredTop}>
                                    <View style={styles.featuredIcon}>
                                        <AiMark animated={false} size={24} />
                                    </View>
                                    <View style={styles.featuredBadge}>
                                        <Text style={styles.featuredBadgeText}>NEW</Text>
                                    </View>
                                </View>
                                <View>
                                    <Text style={styles.featuredTitle}>{FEATURED_SERVICE.label}</Text>
                                    <Text style={styles.featuredDetail}>{FEATURED_SERVICE.detail}</Text>
                                    <Pressable
                                        onPress={() => setNotice('AI Agent selected')}
                                        style={({ pressed }) => [
                                            styles.featuredCta,
                                            pressed && styles.featuredCtaPressed,
                                        ]}
                                    >
                                        <Text style={styles.featuredCtaText}>Build an agent</Text>
                                        <IconifyIcon color="#1D1D1F" name="lucide:arrow-right" size={14} />
                                    </Pressable>
                                </View>
                            </Pressable>
                            <View style={[styles.featureRow, !compact && styles.featureRowWide]}>
                                {SERVICES.map((service, index) => (
                                    <Fragment key={service.kind}>
                                        {index > 0 ? <View style={styles.featureDivider} /> : null}
                                        <FeatureCard
                                            compact={compact}
                                            onPress={() => setNotice(`${service.label} selected`)}
                                            service={service}
                                        />
                                    </Fragment>
                                ))}
                            </View>
                        </View>
                    </View>

                    <View style={styles.section}>
                        <SectionHeading action="Browse all" title="Suggested workflows" />
                        <ScrollView
                            contentContainerStyle={[styles.templateTrack, { paddingHorizontal: gutter }]}
                            decelerationRate="fast"
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            snapToInterval={cardWidth + 14}
                            style={{ marginHorizontal: -gutter }}>
                            {TEMPLATES.map((card) => (
                                <TemplateCard
                                    card={card}
                                    dark={card.id === 'research'}
                                    key={card.id}
                                    onStart={(title) => setNotice(`Starting “${title}”`)}
                                    width={cardWidth}
                                />
                            ))}
                        </ScrollView>
                    </View>

                    <View style={styles.section}>
                        <View style={[styles.workflowColumns, compact && styles.workflowColumnsCompact]}>
                            <View style={styles.workflowColumn}>
                                <SectionHeading action="View all" title="Drafts" />
                                <View style={styles.workflowList}>
                                    {groupedWorkflows.drafts.map((workflow, index, list) => (
                                        <WorkflowRow
                                            key={workflow.name}
                                            last={index === list.length - 1}
                                            onOpen={(name) => setNotice(`Opening ${name}`)}
                                            workflow={workflow}
                                        />
                                    ))}
                                </View>
                            </View>
                            <View style={styles.workflowColumn}>
                                <SectionHeading action="View all" title="Active workflows" />
                                <View style={styles.workflowList}>
                                    {groupedWorkflows.active.map((workflow, index, list) => (
                                        <WorkflowRow
                                            key={workflow.name}
                                            last={index === list.length - 1}
                                            onOpen={(name) => setNotice(`Opening ${name}`)}
                                            workflow={workflow}
                                        />
                                    ))}
                                </View>
                            </View>
                        </View>
                    </View>
                </View>
            </ScrollView>
            <BottomNav />
        </View>
    );
}

const shadow = Platform.select({
    web: {
        boxShadow: '0 18px 54px rgba(25, 25, 24, 0.07)',
    },
    default: {
        elevation: 3,
        shadowColor: '#181817',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
    },
});

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: '#FBFBF9',
    },
    page: {
        alignItems: 'center',
    },
    content: {
        maxWidth: 1244,
        width: '100%',
    },
    heroImage: {
        left: 0,
        position: 'absolute',
        right: 0,
    },
    header: {
        alignItems: 'center',
        flexDirection: 'row',
        height: HEADER_HEIGHT,
        justifyContent: 'space-between',
    },
    headerActions: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 10,
    },
    headerIconButton: {
        alignItems: 'center',
        justifyContent: 'center',
        height: 44,
        width: 44,
        backgroundColor: 'transparent',
        borderWidth: 0,
    },
    avatar: {
        alignItems: 'center',
        backgroundColor: '#1D1D1F',
        borderRadius: 22,
        height: 34,
        justifyContent: 'center',
        position: 'relative',
        width: 34,
    },
    avatarText: {
        color: '#FFFFFF',
        fontFamily: Fonts.sans,
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    onlineDot: {
        backgroundColor: '#4CC17E',
        borderColor: '#FFFFFF',
        borderRadius: 6,
        borderWidth: 2,
        bottom: -1,
        height: 12,
        position: 'absolute',
        right: -1,
        width: 12,
    },
    hero: {
        alignItems: 'center',
        paddingBottom: 8,
    },
    promptCard: {
        backgroundColor: '#FFFFFF',
        borderColor: 'rgba(20,20,20,0.06)',
        borderRadius: 24,
        borderWidth: 1,
        height: PROMPT_HEIGHT,
        justifyContent: 'space-between',
        maxWidth: 720,
        paddingBottom: 10,
        paddingHorizontal: 10,
        paddingTop: 6,
        width: '100%',
    },
    promptInput: {
        color: '#1D1D1F',
        flex: 1,
        fontFamily: Fonts.sans,
        fontSize: 16,
        lineHeight: 22,
        paddingHorizontal: 8,
        paddingVertical: 1,
        textAlignVertical: 'top',
    },
    promptToolbar: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    promptChip: {
        alignItems: 'center',
        backgroundColor: '#F4F4F1',
        borderRadius: 16,
        flexDirection: 'row',
        gap: 6,
        height: 32,
        paddingHorizontal: 10,
    },
    promptChipText: {
        color: '#4A4A47',
        fontFamily: Fonts.sans,
        fontSize: 12,
        fontWeight: '600',
    },
    sendButton: {
        alignItems: 'center',
        backgroundColor: '#1D1D1F',
        borderRadius: 18,
        height: 36,
        justifyContent: 'center',
        width: 36,
    },
    sendButtonDisabled: {
        backgroundColor: '#D4D4D0',
    },
    promptStatus: {
        color: '#9A9A95',
        fontFamily: Fonts.sans,
        fontSize: 11,
        marginTop: 10,
    },
    section: {
        marginTop: 36,
    },
    sectionHeading: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    sectionTitle: {
        color: '#111111',
        fontFamily: Fonts.sans,
        fontSize: 20,
        fontWeight: '700',
        letterSpacing: -0.5,
    },
    sectionActionButton: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 2,
    },
    sectionAction: {
        color: '#8A8A85',
        fontFamily: Fonts.sans,
        fontSize: 13,
        fontWeight: '500',
    },
    serviceLayout: {
        flexDirection: 'row',
        gap: 12,
    },
    serviceLayoutCompact: {
        flexDirection: 'column',
    },
    featuredCard: {
        backgroundColor: '#161618',
        borderRadius: 24,
        justifyContent: 'space-between',
        minHeight: 196,
        overflow: 'hidden',
        padding: 20,
    },
    featuredCardWide: {
        flex: 1,
    },
    featuredGlow: {
        backgroundColor: '#7C5CFF',
        borderRadius: 140,
        height: 220,
        opacity: 0.28,
        position: 'absolute',
        right: -80,
        top: -110,
        width: 220,
        ...Platform.select({ web: { filter: 'blur(40px)' } as object, default: {} }),
    },
    featuredTop: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    featuredIcon: {
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        height: 44,
        justifyContent: 'center',
        width: 44,
    },
    featuredBadge: {
        borderColor: 'rgba(255,255,255,0.22)',
        borderRadius: 10,
        borderWidth: 1,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    featuredBadgeText: {
        color: 'rgba(255,255,255,0.8)',
        fontFamily: Fonts.sans,
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1,
    },
    featuredTitle: {
        color: '#FFFFFF',
        fontFamily: Fonts.sans,
        fontSize: 20,
        fontWeight: '600',
        letterSpacing: -0.4,
        marginTop: 22,
    },
    featuredDetail: {
        color: 'rgba(255,255,255,0.62)',
        fontFamily: Fonts.sans,
        fontSize: 13,
        lineHeight: 19,
        marginTop: 6,
        maxWidth: 340,
    },
    featuredCta: {
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: '#FFFFFF',
        borderRadius: 18,
        flexDirection: 'row',
        gap: 6,
        height: 36,
        marginTop: 16,
        paddingHorizontal: 14,
    },
    featuredCtaPressed: {
        backgroundColor: '#DCDCDC',
    },
    featuredCtaText: {
        color: '#1D1D1F',
        fontFamily: Fonts.sans,
        fontSize: 13,
        fontWeight: '600',
    },
    featureRow: {
        alignItems: 'stretch',
        backgroundColor: '#FFFFFF',
        borderColor: 'rgba(0,0,0,0.06)',
        borderRadius: 24,
        borderWidth: 1,
        flexDirection: 'row',
        overflow: 'hidden',
    },
    featureRowWide: {
        flex: 1.5,
    },
    featureCard: {
        alignItems: 'center',
        flex: 1,
        justifyContent: 'center',
        minWidth: 0,
        paddingBottom: 18,
        paddingHorizontal: 8,
        paddingTop: 20,
    },
    featureCardPressed: {
        backgroundColor: '#F6F6F4',
    },
    featureDivider: {
        alignSelf: 'center',
        backgroundColor: 'rgba(0,0,0,0.07)',
        height: '56%',
        width: StyleSheet.hairlineWidth,
    },
    featureTitle: {
        color: '#111111',
        fontFamily: Fonts.sans,
        fontSize: 15,
        fontWeight: '600',
        letterSpacing: -0.2,
        marginTop: 12,
    },
    featureDetail: {
        color: '#8E8E8A',
        fontFamily: Fonts.sans,
        fontSize: 11.5,
        marginTop: 2,
    },
    templateTrack: {
        gap: 14,
        paddingBottom: 8,
    },
    templateCard: {
        borderRadius: 26,
        height: 280,
        justifyContent: 'space-between',
        padding: 18,
    },
    templateMain: {
        flexDirection: 'row',
        gap: 14,
    },
    templateIcons: {
        alignItems: 'center',
    },
    templateIcon: {
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderColor: 'rgba(0,0,0,0.04)',
        borderRadius: 26,
        borderWidth: 1,
        height: 52,
        justifyContent: 'center',
        width: 52,
    },
    templateIconOverlap: {
        marginTop: -4,
    },
    templateMore: {
        color: '#1D1D1F',
        fontFamily: Fonts.sans,
        fontSize: 16,
        fontWeight: '500',
    },
    templateCopy: {
        flex: 1,
        minWidth: 0,
        paddingTop: 2,
    },
    templateTitle: {
        color: '#111111',
        fontFamily: Fonts.sans,
        fontSize: 17,
        fontWeight: '700',
        letterSpacing: -0.3,
        lineHeight: 21,
    },
    templateDescription: {
        color: '#8A8A88',
        fontFamily: Fonts.sans,
        fontSize: 12,
        lineHeight: 17,
        marginTop: 10,
    },
    templateFooter: {
        alignItems: 'center',
        alignSelf: 'flex-end',
        flexDirection: 'row',
        gap: 12,
    },
    usedBadge: {
        alignItems: 'center',
        borderColor: '#8E8E8C',
        borderRadius: 23,
        borderStyle: 'dashed',
        borderWidth: 1,
        height: 46,
        justifyContent: 'center',
        width: 46,
    },
    usedLabel: {
        color: '#6F6F6D',
        fontFamily: Fonts.sans,
        fontSize: 9,
        lineHeight: 11,
    },
    usedValue: {
        color: '#6F6F6D',
        fontFamily: Fonts.sans,
        fontSize: 9,
        lineHeight: 11,
    },
    startButton: {
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        flexDirection: 'row',
        gap: 10,
        height: 48,
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    startButtonDark: {
        backgroundColor: '#1D1D1F',
    },
    startButtonText: {
        color: '#1D1D1F',
        fontFamily: Fonts.sans,
        fontSize: 14,
        fontWeight: '500',
    },
    startButtonTextDark: {
        color: '#FFFFFF',
    },
    iconStack: {
        alignItems: 'center',
        flexDirection: 'row',
    },
    appIcon: {
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderColor: 'rgba(25,25,24,0.06)',
        borderWidth: 1,
        justifyContent: 'center',
    },
    moreIcons: {
        color: '#656561',
        fontFamily: Fonts.sans,
        fontSize: 12,
        marginLeft: 7,
    },
    workflowColumns: {
        flexDirection: 'row',
        gap: 18,
    },
    workflowColumnsCompact: {
        flexDirection: 'column',
        gap: 30,
    },
    workflowColumn: {
        flex: 1,
        minWidth: 0,
    },
    workflowList: {
        backgroundColor: '#FFFFFF',
        borderColor: '#ECECE8',
        borderRadius: 20,
        borderWidth: 1,
        overflow: 'hidden',
        paddingVertical: 4,
    },
    workflowRow: {
        alignItems: 'center',
        flexDirection: 'row',
        paddingLeft: 14,
    },
    workflowTile: {
        alignItems: 'center',
        backgroundColor: '#F6F6F3',
        borderRadius: 14,
        height: 46,
        justifyContent: 'center',
        width: 46,
    },
    workflowBody: {
        alignItems: 'center',
        flex: 1,
        flexDirection: 'row',
        marginLeft: 12,
        minHeight: 72,
        paddingRight: 16,
    },
    workflowBodyDivider: {
        borderBottomColor: '#EFEFEB',
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    workflowCopy: {
        flex: 1,
        marginRight: 10,
        minWidth: 0,
    },
    workflowName: {
        color: '#1F1F1D',
        fontFamily: Fonts.sans,
        fontSize: 14,
        fontWeight: '600',
        letterSpacing: -0.2,
    },
    workflowMetaRow: {
        alignItems: 'center',
        flexDirection: 'row',
        marginTop: 7,
    },
    workflowMeta: {
        color: '#9A9A95',
        fontFamily: Fonts.sans,
        fontSize: 11,
    },
    workflowLive: {
        color: '#2F8F57',
        fontFamily: Fonts.sans,
        fontSize: 11,
        fontWeight: '600',
    },
    liveDot: {
        backgroundColor: '#38A867',
        borderColor: '#DDF3E5',
        borderRadius: 5,
        borderWidth: 2,
        height: 10,
        marginRight: 5,
        width: 10,
    },
    progressTrack: {
        backgroundColor: '#EFEFEB',
        borderRadius: 2,
        height: 4,
        marginRight: 8,
        overflow: 'hidden',
        width: 44,
    },
    progressFill: {
        backgroundColor: '#292927',
        borderRadius: 2,
        height: 4,
    },
    pressed: {
        opacity: 0.78,
        transform: [{ scale: 0.98 }],
    },
    rowPressed: {
        backgroundColor: '#F4F4F1',
    },
});

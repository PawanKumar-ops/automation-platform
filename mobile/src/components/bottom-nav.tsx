import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconifyIcon } from '@/components/iconify-icon';
import { Fonts } from '@/constants/theme';

type TabKey = 'home' | 'workflows' | 'create' | 'explore' | 'activity';

const TABS: { key: TabKey; label: string; icon?: `${string}:${string}` }[] = [
    { key: 'home', label: 'Home' },
    { key: 'workflows', label: 'Workflows', icon: 'lucide:workflow' },
    { key: 'create', label: 'Create' },
    { key: 'explore', label: 'Explore', icon: 'lucide:compass' },
    { key: 'activity', label: 'Activity', icon: 'lucide:activity' },
];

const INK = '#1A1A1A';
const ICON = 22;
const BAR_PADDING = 3;
export const BOTTOM_NAV_SPACE = 80;

function TabIcon({ tabKey, icon, active }: { tabKey: TabKey; icon?: `${string}:${string}`; active: boolean }) {
    if (tabKey === 'home') {
        return active ? (
            <Image contentFit="contain" source={require('@/assets/taskvyn.icon/black.svg')} style={styles.homeGlyph} />
        ) : (
            <Image contentFit="contain" source={require('@/assets/images/nav-home.png')} style={styles.homeGlyph} tintColor={INK} />
        );
    }
    if (tabKey === 'create') {
        return (
            <View style={styles.createIcon}>
                <IconifyIcon color="#FFFFFF" name="lucide:plus" size={17} />
            </View>
        );
    }
    return <IconifyIcon color={INK} name={icon!} size={ICON} />;
}

/** Floating frosted pill navigation, modeled on the reference design. */
export function BottomNav({ initial = 'home' }: { initial?: Exclude<TabKey, 'create'> }) {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [active, setActive] = useState<TabKey>(initial);
    const [tabWidth, setTabWidth] = useState(0);
    const slide = useRef(new Animated.Value(0)).current;
    const activeIndex = TABS.findIndex((tab) => tab.key === active);

    useEffect(() => {
        if (!tabWidth) return;
        Animated.spring(slide, {
            toValue: activeIndex * tabWidth,
            damping: 22,
            mass: 0.8,
            stiffness: 240,
            useNativeDriver: Platform.OS !== 'web',
        }).start();
    }, [activeIndex, slide, tabWidth]);

    const onBarLayout = (event: LayoutChangeEvent) => {
        const width = (event.nativeEvent.layout.width - BAR_PADDING * 2) / TABS.length;
        if (!tabWidth) slide.setValue(activeIndex * width);
        setTabWidth(width);
    };

    return (
        <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 10) + 8 }]}>
            <View accessibilityRole="tablist" onLayout={onBarLayout} style={styles.bar}>
                <BlurView intensity={Platform.OS === 'ios' ? 40 : 28} style={StyleSheet.absoluteFill} tint="light" />
                <View pointerEvents="none" style={styles.glassTint} />
                <View pointerEvents="none" style={styles.glassSheen} />
                {tabWidth ? (
                    <Animated.View
                        pointerEvents="none"
                        style={[styles.indicator, { width: tabWidth, transform: [{ translateX: slide }] }]}
                    />
                ) : null}
                {TABS.map((tab) => {
                    const selected = tab.key === active;
                    return (
                        <Pressable
                            accessibilityLabel={tab.label}
                            accessibilityRole={tab.key === 'create' ? 'button' : 'tab'}
                            accessibilityState={{ selected }}
                            key={tab.key}
                            onPress={() => (tab.key === 'create' ? router.push('/canvas') : setActive(tab.key))}
                            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
                            <View style={styles.iconBox}>
                                <TabIcon active={selected} icon={tab.icon} tabKey={tab.key} />
                            </View>
                            <Text
                                adjustsFontSizeToFit
                                minimumFontScale={0.85}
                                numberOfLines={1}
                                style={[styles.label, selected && styles.labelActive]}>
                                {tab.label}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        alignItems: 'center',
        left: 0,
        paddingHorizontal: 16,
        position: 'absolute',
        right: 0,
    },
    bar: {
        alignItems: 'center',
        backgroundColor: 'transparent',
        borderColor: 'rgb(244, 244, 244)',
        borderRadius: 28,
        borderWidth: 1,
        flexDirection: 'row',
        height: 56,
        maxWidth: 420,
        overflow: 'hidden',
        padding: BAR_PADDING,
        width: '100%',

    },
    tab: {
        alignItems: 'center',
        alignSelf: 'stretch',
        borderRadius: 25,
        flex: 1,
        gap: 2,
        justifyContent: 'center',
        minWidth: 0,
    },
    glassTint: {
        bottom: 0,
        left: 0,
        position: 'absolute',
        right: 0,
        top: 0,
        backgroundColor: Platform.OS === 'android' ? 'rgba(250,250,250,0.88)' : 'rgba(255,255,255,0.55)',
    },
    glassSheen: {
        backgroundColor: 'rgba(255,255,255,0.45)',
        height: 1,
        left: 18,
        position: 'absolute',
        right: 18,
        top: 0,
    },
    indicator: {
        backgroundColor: 'rgba(0,0,0,0.065)',
        borderRadius: 25,
        bottom: BAR_PADDING,
        left: BAR_PADDING,
        position: 'absolute',
        top: BAR_PADDING,
    },
    iconBox: {
        alignItems: 'center',
        height: ICON,
        justifyContent: 'center',
        width: ICON,
    },
    homeGlyph: {
        height: ICON,
        width: ICON,
    },
    createIcon: {
        alignItems: 'center',
        backgroundColor: '#111111',
        borderRadius: 12,
        height: ICON,
        justifyContent: 'center',
        width: ICON,
    },
    label: {
        color: INK,
        fontFamily: Fonts.sans,
        fontSize: 10,
        paddingHorizontal: 4,
        fontWeight: '500',
        letterSpacing: -0.1,
    },
    labelActive: {
        color: '#111111',
        fontWeight: '700',
    },
    pressed: {
        opacity: 0.6,
    },
});

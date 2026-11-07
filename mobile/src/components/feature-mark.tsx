import Svg, { Path, Rect } from 'react-native-svg';

import { AI_MARK_HEX } from './ai-mark-frames';

const VB_W = 190;
const VB_H = 166;
const INK = '#FFFFFF';

export type FeatureKind = 'tables' | 'mcp' | 'forms';

/** [accent, deep accent, soft surface] per feature. */
export const FEATURE_COLORS: Record<FeatureKind, [string, string, string]> = {
    tables: ['#3DDC97', '#14895A', '#EDF7F1'],
    mcp: ['#FF9F5A', '#C9561C', '#FBF1EA'],
    forms: ['#7EA6FF', '#2F5BD3', '#EEF2FC'],
};

function Glyph({ kind, accent }: { kind: FeatureKind; accent: string }) {
    if (kind === 'tables') {
        return (
            <>
                <Rect fill={accent} height={23} rx={4} width={27} x={63} y={55} />
                <Rect fill="none" height={56} rx={11} stroke={INK} strokeWidth={9} width={64} x={63} y={55} />
                <Path d="M63 83 H127 M95 55 V111" stroke={INK} strokeWidth={8} />
            </>
        );
    }
    if (kind === 'mcp') {
        return (
            <>
                <Path d="M82 48 V62 M108 48 V62" stroke={INK} strokeLinecap="round" strokeWidth={9} />
                <Path d="M68 62 H122 V78 A27 27 0 0 1 68 78 Z" fill={INK} />
                <Path d="M95 105 V120" stroke={INK} strokeLinecap="round" strokeWidth={9} />
                <Rect fill={accent} height={10} rx={5} width={10} x={90} y={74} />
            </>
        );
    }
    return (
        <>
            <Rect fill={accent} height={20} rx={6} width={20} x={62} y={56} />
            <Path d="M67 66 L71 70 L78 62" fill="none" stroke="#161518" strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} />
            <Path d="M94 66 H128" stroke={INK} strokeLinecap="round" strokeWidth={9} />
            <Rect fill="none" height={17} rx={5} stroke={INK} strokeWidth={5} width={17} x={63.5} y={91.5} />
            <Path d="M94 100 H118" stroke={INK} strokeLinecap="round" strokeWidth={9} />
        </>
    );
}

/** Feature badge sharing the AiMark hexagon silhouette, with a per-feature accent. */
export function FeatureMark({ kind, size = 48 }: { kind: FeatureKind; size?: number }) {
    return (
        <Svg height={(size * VB_H) / VB_W} pointerEvents="none" viewBox={`0 0 ${VB_W} ${VB_H}`} width={size}>
            <Path d={AI_MARK_HEX} fill="#161518" />
            <Glyph accent={FEATURE_COLORS[kind][0]} kind={kind} />
        </Svg>
    );
}

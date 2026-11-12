import { IconifyIcon } from '@/components/iconify-icon';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ComponentRef, ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ACCENT = '#FFFFFF';
const INK = '#1D1D1F';

type AuthFrameProps = {
  children?: ReactNode;
  footer?: ReactNode;
  subtitle?: string;
  title: string;
  onBack?: () => void;
};

function AuthFrame({ children, footer, onBack, subtitle, title }: AuthFrameProps) {
  const insets = useSafeAreaInsets();
  const [opacity] = useState(() => new Animated.Value(0));
  const [offset] = useState(() => new Animated.Value(12));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { duration: 360, toValue: 1, useNativeDriver: true }),
      Animated.spring(offset, { damping: 19, stiffness: 140, toValue: 0, useNativeDriver: true }),
    ]).start();
  }, [offset, opacity]);

  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.screen}>
      <View pointerEvents="none" style={styles.glow} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 }]}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.frame}>
          <View style={styles.topBar}>
            <Pressable
              accessibilityLabel="Go back"
              accessibilityRole="button"
              hitSlop={12}
              onPress={back}
              style={({ pressed }) => [styles.backButton, pressed && styles.iconPressed]}>
              <IconifyIcon color="#FFFFFF" name="lucide:chevron-left" size={18} />
            </Pressable>
            <View style={styles.brandRow}>
              <Image contentFit="contain" source={require('@/assets/taskvyn.icon/white.svg')} style={styles.brandLogo} />
              <Text style={styles.brandName}>Taskvyn</Text>
            </View>
            <View style={styles.backButtonSpacer} />
          </View>

          <Animated.View style={{ opacity, transform: [{ translateY: offset }] }}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            {children ? <View style={styles.content}>{children}</View> : null}
          </Animated.View>
          {footer ? (
            <Animated.View style={[styles.footer, { opacity, transform: [{ translateY: offset }] }]}>{footer}</Animated.View>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type FieldProps = TextInputProps & {
  icon: `${string}:${string}`;
  label: string;
  password?: boolean;
};

function Field({ icon, label, password, onBlur, onFocus, ...props }: FieldProps) {
  const [hidden, setHidden] = useState(password);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.field, focused && styles.fieldFocused]}>
        <IconifyIcon color={focused ? '#FFFFFF' : '#7C7C82'} name={icon} size={16} />
        <TextInput
          autoCapitalize="none"
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          placeholderTextColor="#5E5E64"
          secureTextEntry={Boolean(password && hidden)}
          selectionColor={ACCENT}
          style={styles.input}
          {...props}
        />
        {password ? (
          <Pressable
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            hitSlop={10}
            onPress={() => setHidden((v) => !v)}>
            <IconifyIcon color="#7C7C82" name={hidden ? 'lucide:eye' : 'lucide:eye-off'} size={16} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
      <Text style={styles.primaryButtonText}>{label}</Text>
      <IconifyIcon color={INK} name="lucide:arrow-right" size={15} />
    </Pressable>
  );
}

function OutlineButton({ icon, label, onPress }: { icon: ReactNode; label: string; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.outlineButton, pressed && styles.outlinePressed]}>
      <View style={styles.outlineIcon}>{icon}</View>
      <Text style={styles.outlineLabel}>{label}</Text>
    </Pressable>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <View style={styles.divider}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>{label}</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

function AuthSwitch({ label, link, onPress }: { label: string; link: string; onPress: () => void }) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchMuted}>{label} </Text>
      <Pressable accessibilityRole="link" hitSlop={8} onPress={onPress}>
        <Text style={styles.switchLink}>{link}</Text>
      </Pressable>
    </View>
  );
}

function SocialRow() {
  return (
    <View style={styles.socialRow}>
      {(['logos:google-icon', 'simple-icons:apple'] as const).map((name) => (
        <Pressable key={name} style={({ pressed }) => [styles.socialButton, pressed && styles.outlinePressed]}>
          <IconifyIcon color="#FFFFFF" name={name} size={18} />
        </Pressable>
      ))}
    </View>
  );
}

export function SignInScreen() {
  const [emailMode, setEmailMode] = useState(false);

  if (emailMode) {
    return (
      <AuthFrame
        footer={
          <>
            <PrimaryButton label="Log In" onPress={() => router.replace('/dashboard')} />
            <AuthSwitch label="New to Taskvyn?" link="Sign Up" onPress={() => router.replace('/sign-up')} />
          </>
        }
        onBack={() => setEmailMode(false)}
        subtitle="Welcome back. Enter your details to continue."
        title="Log in with email">
        <View style={styles.form}>
          <Field autoComplete="email" icon="lucide:mail" keyboardType="email-address" label="Email" placeholder="you@example.com" />
          <Field autoComplete="current-password" icon="lucide:lock-keyhole" label="Password" password placeholder="Enter your password" />
          <Pressable accessibilityRole="link" onPress={() => router.push('/forgot-password')} style={styles.forgotLink}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>
        </View>
      </AuthFrame>
    );
  }

  return <SignInMethods onEmail={() => setEmailMode(true)} />;
}

/** Original sign-in layout: close button, centered brand + heading, options at the bottom. */
function SignInMethods({ onEmail }: { onEmail: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
      <View style={[styles.frame, styles.methodsFrame]}>
        <Pressable
          accessibilityLabel="Close"
          accessibilityRole="button"
          hitSlop={14}
          onPress={() => router.replace('/')}
          style={({ pressed }) => [styles.methodsClose, pressed && styles.iconPressed]}>
          <IconifyIcon color="#FFFFFF" name="lucide:x" size={24} />
        </Pressable>
        <View style={styles.methodsHeading}>
          <View style={styles.brandRow}>
            <Image contentFit="contain" source={require('@/assets/taskvyn.icon/white.svg')} style={styles.methodsLogo} />
            <Text style={styles.methodsBrand}>
              Taskvyn <Text style={styles.methodsBrandLight}>account</Text>
            </Text>
          </View>
          <Text style={styles.methodsTitle}>{'Log in to Taskvyn using\nyour preferred method!'}</Text>
        </View>
        <View style={styles.socialStack}>
          <OutlineButton icon={<IconifyIcon color="#FFFFFF" name="lucide:mail" size={17} />} label="Continue with email" onPress={onEmail} />
          <OutlineButton icon={<IconifyIcon name="logos:google-icon" size={16} />} label="Continue with Google" />
          <OutlineButton icon={<IconifyIcon color="#FFFFFF" name="simple-icons:apple" size={17} />} label="Continue with Apple" />
        </View>
        <AuthSwitch label="New to Taskvyn?" link="Sign Up" onPress={() => router.replace('/sign-up')} />
      </View>
    </View>
  );
}

export function SignUpScreen() {
  return (
    <AuthFrame
      footer={
        <>
          <PrimaryButton label="Create Account" onPress={() => router.push('/verify-email')} />
          <AuthSwitch label="Already have an account?" link="Log In" onPress={() => router.replace('/sign-in')} />
        </>
      }
      subtitle="Start building automations in minutes." title="Create your account">
      <View style={styles.form}>
        <Field autoCapitalize="words" autoComplete="name" icon="lucide:user" label="Full name" placeholder="Jane Cooper" />
        <Field autoComplete="email" icon="lucide:mail" keyboardType="email-address" label="Email" placeholder="you@example.com" />
        <Field autoComplete="new-password" icon="lucide:lock-keyhole" label="Password" password placeholder="Create a password" />
        <Text style={styles.helper}>At least 8 characters, including a number and a symbol.</Text>
      </View>
      <Divider label="or sign up with" />
      <SocialRow />
    </AuthFrame>
  );
}

export function ForgotPasswordScreen() {
  return (
    <AuthFrame
      footer={
        <>
          <PrimaryButton label="Send Code" onPress={() => router.push('/verify-email')} />
          <Pressable accessibilityRole="link" onPress={() => router.replace('/sign-in')} style={styles.centerLink}>
            <IconifyIcon color="#FFFFFF" name="lucide:arrow-left" size={14} />
            <Text style={styles.centerLinkText}>Back to Log In</Text>
          </Pressable>
        </>
      }
      subtitle="Enter your email and we'll send you a 6-digit code to reset your password." title="Forgot password?">
      <Field autoComplete="email" icon="lucide:mail" keyboardType="email-address" label="Email" placeholder="you@example.com" />
    </AuthFrame>
  );
}
export function VerifyEmailScreen() {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const refs = useRef<(ComponentRef<typeof TextInput> | null)[]>([]);

  const updateDigit = (value: string, index: number) => {
    const next = value.replace(/\D/g, '').slice(-1);
    setDigits((current) => current.map((d, i) => (i === index ? next : d)));
    if (next && index < 5) refs.current[index + 1]?.focus();
  };

  return (
    <AuthFrame
      footer={
        <>
          <PrimaryButton label="Verify Email" onPress={() => router.push('/reset-password')} />
          <AuthSwitch label="Didn’t receive the code?" link="Resend" onPress={() => {}} />
        </>
      }
      subtitle="We sent a 6-digit code to your email. Enter it below to continue." title="Verify your email">
      <View style={styles.otpRow}>
        {digits.map((digit, index) => (
          <TextInput
            key={index}
            ref={(node) => {
              refs.current[index] = node;
            }}
            accessibilityLabel={`Verification digit ${index + 1}`}
            autoFocus={index === 0}
            keyboardType="number-pad"
            maxLength={1}
            onChangeText={(v) => updateDigit(v, index)}
            onFocus={() => setFocusedIndex(index)}
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === 'Backspace' && !digit && index > 0) refs.current[index - 1]?.focus();
            }}
            selectionColor={ACCENT}
            style={[styles.otpInput, digit ? styles.otpFilled : null, focusedIndex === index && styles.otpFocused]}
            value={digit}
          />
        ))}
      </View>
    </AuthFrame>
  );
}

export function ResetPasswordScreen() {
  return (
    <AuthFrame
      footer={<PrimaryButton label="Reset Password" onPress={() => router.replace('/sign-in')} />}
      subtitle="Your new password must be different from ones you've used before." title="Set a new password">
      <View style={styles.form}>
        <Field autoComplete="new-password" icon="lucide:lock-keyhole" label="New password" password placeholder="Enter new password" />
        <Field autoComplete="new-password" icon="lucide:shield-check" label="Confirm password" password placeholder="Re-enter new password" />
        <Text style={styles.helper}>At least 8 characters, including a number and a symbol.</Text>
      </View>
    </AuthFrame>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#000000', flex: 1 },
  glow: {
    experimental_backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(255,255,255,0.07), rgba(0,0,0,0) 60%)',
    height: 420,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  } as object,
  scroll: { flexGrow: 1 },
  methodsFrame: { flex: 1 },
  methodsClose: { alignItems: 'center', alignSelf: 'flex-end', height: 44, justifyContent: 'center', width: 44 },
  methodsHeading: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingVertical: 32 },
  methodsLogo: { height: 20, width: 20 },
  methodsBrand: { color: '#FFFFFF', fontSize: 19, fontWeight: '800', letterSpacing: -0.5 },
  methodsBrandLight: { fontWeight: '400' },
  methodsTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 29,
    marginTop: 16,
    textAlign: 'center',
  },
  footer: { marginTop: 'auto', paddingTop: 28 },
  frame: { alignSelf: 'center', flex: 1, maxWidth: 480, paddingHorizontal: 28, width: '100%' },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 26 },
  backButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 11,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  backButtonSpacer: { width: 34 },
  iconPressed: { opacity: 0.6, transform: [{ scale: 0.94 }] },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  brandLogo: { height: 18, width: 18 },
  brandName: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: -0.6 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', letterSpacing: -0.5, lineHeight: 28 },
  subtitle: { color: '#8E8E94', fontSize: 13.5, lineHeight: 19, marginTop: 6 },
  content: { marginTop: 22 },
  form: { gap: 13 },
  fieldWrap: { gap: 6 },
  fieldLabel: { color: '#C9C9CE', fontSize: 12, fontWeight: '600', marginLeft: 4 },
  field: {
    alignItems: 'center',
    backgroundColor: '#0E0E10',
    borderColor: '#26262A',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    height: 46,
    paddingHorizontal: 14,
  },
  fieldFocused: { backgroundColor: '#141416', borderColor: '#8A8A90' },
  input: { color: '#FFFFFF', flex: 1, fontSize: 14.5, height: '100%', outlineStyle: 'none' } as object,
  forgotLink: { alignSelf: 'flex-end', marginTop: -4 },
  forgotText: { color: ACCENT, fontSize: 13, fontWeight: '700' },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: ACCENT,
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    height: 50,
    justifyContent: 'center',
    marginTop: 6,
  },
  pressed: { opacity: 0.86, transform: [{ scale: 0.985 }] },
  primaryButtonText: { color: INK, fontSize: 15, fontWeight: '800' },
  socialStack: { gap: 12 },
  outlineButton: {
    alignItems: 'center',
    backgroundColor: '#0B0B0D',
    borderColor: '#26262A',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    height: 42,
    justifyContent: 'center',
  },
  outlinePressed: { backgroundColor: '#141417', borderColor: '#45454B', transform: [{ scale: 0.985 }] },
  outlineIcon: { left: 22, position: 'absolute' },
  outlineLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  divider: { alignItems: 'center', flexDirection: 'row', gap: 12, marginVertical: 20 },
  dividerLine: { backgroundColor: '#222226', flex: 1, height: 1 },
  dividerText: { color: '#6E6E74', fontSize: 12 },
  socialRow: { flexDirection: 'row', gap: 12 },
  socialButton: {
    alignItems: 'center',
    backgroundColor: '#0B0B0D',
    borderColor: '#26262A',
    borderRadius: 13,
    borderWidth: 1,
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  switchMuted: { color: '#7A7A80', fontSize: 13 },
  switchLink: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  helper: { color: '#6E6E74', fontSize: 12, lineHeight: 16, marginLeft: 4, marginTop: -6 },
  centerLink: { alignItems: 'center', alignSelf: 'center', flexDirection: 'row', gap: 6, marginTop: 20 },
  centerLinkText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  otpRow: { flexDirection: 'row', gap: 10, justifyContent: 'space-between', marginBottom: 22 },
  otpInput: {
    backgroundColor: '#0E0E10',
    borderColor: '#26262A',
    borderRadius: 13,
    borderWidth: 1,
    color: '#FFFFFF',
    flex: 1,
    fontSize: 19,
    fontWeight: '800',
    height: 50,
    maxWidth: 64,
    outlineStyle: 'none',
    textAlign: 'center',
  } as object,
  otpFilled: { borderColor: '#3A3A40' },
  otpFocused: { backgroundColor: '#141416', borderColor: '#8A8A90' },
});

import logos from '@iconify-json/logos/icons.json';
import lucide from '@iconify-json/lucide/icons.json';
import simpleIcons from '@iconify-json/simple-icons/icons.json';
import { SvgXml } from 'react-native-svg';

type IconData = {
  body: string;
  height?: number;
  width?: number;
};

type IconCollection = {
  height?: number;
  width?: number;
  icons: Record<string, IconData>;
};

const collections: Record<string, IconCollection> = {
  logos: logos as IconCollection,
  lucide: lucide as IconCollection,
  'simple-icons': simpleIcons as IconCollection,
};

type IconifyIconProps = {
  color?: string;
  name: `${string}:${string}`;
  size?: number;
};

export function IconifyIcon({ color = '#111111', name, size = 20 }: IconifyIconProps) {
  const [prefix, iconName] = name.split(':');
  const collection = collections[prefix];
  const icon = collection?.icons[iconName];

  if (!icon) {
    return null;
  }

  const width = icon.width ?? collection.width ?? 24;
  const height = icon.height ?? collection.height ?? 24;
  const body = icon.body.replace(/currentColor/g, color);
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${body}</svg>`;

  return <SvgXml height={size} width={size} xml={xml} />;
}

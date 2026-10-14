import {
  Archive, Award, BookOpen, Box, Calendar, Camera, Clapperboard, Crown, Dice5, FileText,
  Film, Flag, Gamepad2, Gift, Heart, Image, Map, Megaphone, Mic, Music, Package, Puzzle,
  Shield, Star, Swords, Target, Ticket, Trophy, Users, Wrench, Wallet, ArrowRightLeft, type LucideIcon,
} from 'lucide-react';
import { ENTITY_ICON_NAMES } from '@/portal/icons';

/** Иконки разделов в редакторе. Набор имён общий с порталом (src/portal/icons.ts). */
export const ENTITY_ICONS: Record<(typeof ENTITY_ICON_NAMES)[number], LucideIcon> = {
  Calendar, Users, Package, Trophy, Swords, Gamepad2, Dice5, Puzzle, Film, Camera, Clapperboard,
  Mic, Music, Megaphone, BookOpen, FileText, Image, Map, Flag, Target, Ticket, Gift, Award,
  Crown, Shield, Star, Heart, Box, Archive, Wrench, Wallet, ArrowRightLeft,
};

export const ICON_NAMES: string[] = [...ENTITY_ICON_NAMES];

export function getEntityIcon(name: string): LucideIcon {
  return ENTITY_ICONS[name as keyof typeof ENTITY_ICONS] ?? Box;
}

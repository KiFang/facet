import {
  Archive, Award, BookOpen, Box, Calendar, Camera, Clapperboard, Crown, Dice5, FileText,
  Film, Flag, Gamepad2, Gift, Heart, Image, Map, Megaphone, Mic, Music, Package, Puzzle,
  Shield, Star, Swords, Target, Ticket, Trophy, Users, Wrench, type LucideIcon,
} from 'lucide-react';

export const ENTITY_ICONS: Record<string, LucideIcon> = {
  Calendar, Users, Package, Trophy, Swords, Gamepad2, Dice5, Puzzle, Film, Camera, Clapperboard,
  Mic, Music, Megaphone, BookOpen, FileText, Image, Map, Flag, Target, Ticket, Gift, Award,
  Crown, Shield, Star, Heart, Box, Archive, Wrench,
};

export const ICON_NAMES = Object.keys(ENTITY_ICONS);

export function getEntityIcon(name: string): LucideIcon {
  return ENTITY_ICONS[name] ?? Box;
}

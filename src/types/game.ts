export type SubjectCategory = 'mates' | 'lengua' | 'ciencias' | 'logica';

export type GameModuleId =
  | 'mates_sumas'
  | 'mates_tablas'
  | 'mates_reloj'
  | 'mates_euros'
  | 'mates_formas'
  | 'lengua_ortografia'
  | 'lengua_lectura'
  | 'lengua_silabas'
  | 'lengua_sinonimos'
  | 'ciencias_cuerpo'
  | 'ciencias_animales'
  | 'ciencias_estaciones'
  | 'ciencias_planetas'
  | 'logica_memoria'
  | 'logica_series'
  | 'logica_sopa';

export interface QuestionOption {
  id: string;
  text: string;
  isCorrect: boolean;
  visualAid?: string;
}

export interface Question {
  id: string;
  moduleId: GameModuleId;
  title: string;
  instruction: string;
  promptVisual?: {
    type: 'emoji' | 'clock' | 'coins' | 'word' | 'math_blocks' | 'diagram';
    value: string;
    extraDetails?: Record<string, unknown>;
  };
  options: QuestionOption[];
  explanation: string;
  rewardGems: number;
}

export interface GameModuleInfo {
  id: GameModuleId;
  subject: SubjectCategory;
  title: string;
  description: string;
  iconName: string;
  color: string;
  accentBg: string;
  badgeText: string;
  difficulty: 'Fácil' | 'Medio' | 'Reto Estrella';
  totalQuestions: number;
}

export interface Sticker {
  id: string;
  name: string;
  category: 'animales' | 'espacio' | 'naturaleza' | 'magia' | 'deportes';
  emoji: string;
  description: string;
  priceGems: number;
  unlocked: boolean;
}

export interface UserProfile {
  name: string;
  avatarEmoji: string;
  avatarColor: string;
  accessoryEmoji: string;
  grade: string;
  level: number;
  totalXP: number;
  gems: number;
  stars: number;
  streakDays: number;
  lastPlayDate: string;
  unlockedStickers: string[];
  completedModuleIds: string[];
}

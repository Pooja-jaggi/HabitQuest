/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  CheckCircle2, 
  Circle, 
  TrendingUp, 
  Calendar, 
  Trophy, 
  Flame, 
  Settings, 
  BarChart3, 
  ChevronLeft, 
  ChevronRight,
  Sword,
  Shield,
  Zap,
  Star
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  setDoc, 
  getDoc,
  serverTimestamp,
  getDocFromServer
} from 'firebase/firestore';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  format, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  subDays, 
  isSameDay, 
  parseISO,
  startOfMonth,
  endOfMonth,
  subMonths
} from 'date-fns';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { db, auth } from './firebase';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Habit {
  id: string;
  name: string;
  icon: string;
  color: string;
  createdAt: any;
  userId: string;
}

interface Log {
  id: string;
  habitId: string;
  date: string;
  completed: boolean;
  userId: string;
}

interface UserStats {
  level: number;
  xp: number;
  streak: number;
  lastActive?: string;
}

// --- Constants ---
const XP_PER_HABIT = 10;
const XP_TO_LEVEL = 100;

// --- Components ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [stats, setStats] = useState<UserStats>({ level: 1, xp: 0, streak: 0 });
  const [isAdding, setIsAdding] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  const [selectedColor, setSelectedColor] = useState('#3b82f6');
  const [selectedIcon, setSelectedIcon] = useState('Zap');

  const today = format(new Date(), 'yyyy-MM-dd');

  // Auth & Initial Setup
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        testConnection();
      }
    });
    return () => unsubscribe();
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  async function testConnection() {
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
    } catch (error) {
      if (error instanceof Error && error.message.includes('the client is offline')) {
        console.error("Please check your Firebase configuration.");
      }
    }
  }

  // Data Fetching
  useEffect(() => {
    if (!user) return;

    const habitsQuery = query(collection(db, 'habits'), where('userId', '==', user.uid));
    const habitsUnsub = onSnapshot(habitsQuery, (snapshot) => {
      setHabits(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Habit)));
    });

    const logsQuery = query(collection(db, 'logs'), where('userId', '==', user.uid));
    const logsUnsub = onSnapshot(logsQuery, (snapshot) => {
      setLogs(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Log)));
    });

    const statsRef = doc(db, 'userStats', user.uid);
    const statsUnsub = onSnapshot(statsRef, async (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as UserStats;
        setStats(data);
        
        // Streak Logic
        const lastActive = data.lastActive;
        const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
        
        if (lastActive && lastActive !== today) {
          if (lastActive === yesterday) {
            // Streak continues (will be updated when first habit is done today)
          } else if (lastActive < yesterday) {
            // Streak broken
            await updateDoc(statsRef, { streak: 0, lastActive: today });
          }
        } else if (!lastActive) {
          await updateDoc(statsRef, { lastActive: today });
        }
      } else {
        await setDoc(statsRef, { level: 1, xp: 0, streak: 0, lastActive: today });
      }
    });

    return () => {
      habitsUnsub();
      logsUnsub();
      statsUnsub();
    };
  }, [user]);

  // Actions
  const addHabit = async () => {
    if (!user || !newHabitName.trim()) return;
    await addDoc(collection(db, 'habits'), {
      name: newHabitName,
      icon: selectedIcon,
      color: selectedColor,
      createdAt: serverTimestamp(),
      userId: user.uid
    });
    setNewHabitName('');
    setIsAdding(false);
  };

  const toggleHabit = async (habitId: string) => {
    if (!user) return;
    const logId = `${habitId}_${today}`;
    const existingLog = logs.find(l => l.id === logId);
    const logRef = doc(db, 'logs', logId);

    if (existingLog) {
      await updateDoc(logRef, { completed: !existingLog.completed });
      updateXP(existingLog.completed ? -XP_PER_HABIT : XP_PER_HABIT);
    } else {
      await setDoc(logRef, {
        habitId,
        date: today,
        completed: true,
        userId: user.uid
      });
      
      // Update XP and Streak
      const statsRef = doc(db, 'userStats', user.uid);
      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
      
      let newStreak = stats.streak;
      if (stats.lastActive !== today) {
        if (stats.lastActive === yesterday) {
          newStreak += 1;
        } else {
          newStreak = 1;
        }
        await updateDoc(statsRef, { lastActive: today, streak: newStreak });
      }
      updateXP(XP_PER_HABIT);
    }
  };

  const updateXP = async (amount: number) => {
    if (!user) return;
    const statsRef = doc(db, 'userStats', user.uid);
    let newXP = stats.xp + amount;
    let newLevel = stats.level;

    if (newXP >= XP_TO_LEVEL) {
      newXP -= XP_TO_LEVEL;
      newLevel += 1;
    } else if (newXP < 0 && newLevel > 1) {
      newXP += XP_TO_LEVEL;
      newLevel -= 1;
    } else if (newXP < 0) {
      newXP = 0;
    }

    await updateDoc(statsRef, { xp: newXP, level: newLevel });
  };

  // Calculations
  const todayCompletionRate = useMemo(() => {
    if (habits.length === 0) return 0;
    const completedToday = logs.filter(l => l.date === today && l.completed).length;
    return Math.round((completedToday / habits.length) * 100);
  }, [habits, logs, today]);

  const productivityStatus = useMemo(() => {
    if (todayCompletionRate >= 100) return { label: 'Legendary', color: 'text-yellow-400', icon: Trophy };
    if (todayCompletionRate >= 70) return { label: 'Heroic', color: 'text-blue-400', icon: Sword };
    if (todayCompletionRate >= 40) return { label: 'Adventurer', color: 'text-green-400', icon: Shield };
    return { label: 'Novice', color: 'text-gray-400', icon: Zap };
  }, [todayCompletionRate]);

  const weeklyData = useMemo(() => {
    const last7Days = eachDayOfInterval({
      start: subDays(new Date(), 6),
      end: new Date()
    });

    return last7Days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayLogs = logs.filter(l => l.date === dateStr && l.completed);
      return {
        name: format(day, 'EEE'),
        count: dayLogs.length,
        percentage: habits.length > 0 ? (dayLogs.length / habits.length) * 100 : 0
      };
    });
  }, [logs, habits]);

  const monthlyData = useMemo(() => {
    const last30Days = eachDayOfInterval({
      start: subDays(new Date(), 29),
      end: new Date()
    });

    return last30Days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayLogs = logs.filter(l => l.date === dateStr && l.completed);
      return {
        date: format(day, 'MMM d'),
        count: dayLogs.length
      };
    });
  }, [logs]);

  // ... (rest of the app)
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-4 text-center">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="max-w-md space-y-8"
        >
          <div className="w-24 h-24 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-3xl mx-auto flex items-center justify-center shadow-2xl shadow-blue-500/20">
            <Sword size={48} className="text-white" />
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-black text-white tracking-tight">HABIT QUEST</h1>
            <p className="text-slate-400 text-lg">
              Level up your life. Track your habits, gain XP, and become legendary.
            </p>
          </div>
          <button 
            onClick={login}
            className="w-full py-4 bg-white text-slate-900 rounded-2xl font-black text-lg hover:bg-slate-100 transition-all shadow-xl flex items-center justify-center gap-3 active:scale-95"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" />
            ENTER THE QUEST
          </button>
          <p className="text-[10px] text-slate-600 uppercase font-bold tracking-widest">
            Securely powered by Google Auth
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 font-sans selection:bg-blue-500/30">
      {/* --- Header / Stats Bar --- */}
      <header className="sticky top-0 z-50 bg-[#0f172a]/80 backdrop-blur-md border-b border-slate-800 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center border-2 border-slate-700 shadow-lg shadow-blue-500/20">
                <span className="text-lg font-bold text-white">{stats.level}</span>
              </div>
              <div className="absolute -bottom-1 -right-1 bg-yellow-500 text-[10px] font-black px-1 rounded border border-slate-900 text-slate-900">
                LVL
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">HabitQuest</h1>
                <div className="flex items-center gap-1 bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded-full text-xs font-bold border border-orange-500/20">
                  <Flame size={12} fill="currentColor" />
                  {stats.streak}
                </div>
              </div>
              <div className="w-48 h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
                <motion.div 
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.xp}%` }}
                  transition={{ type: 'spring', bounce: 0, duration: 1 }}
                />
              </div>
              <span className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">
                XP: {stats.xp} / {XP_TO_LEVEL}
              </span>
            </div>
          </div>
          
          <div className="hidden sm:flex items-center gap-6">
            <div className="text-right">
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Daily Quest</div>
              <div className="text-xl font-black text-white">{todayCompletionRate}%</div>
            </div>
            <div className={cn("flex flex-col items-end", productivityStatus.color)}>
              <div className="text-[10px] font-bold uppercase tracking-tighter opacity-70">Status</div>
              <div className="flex items-center gap-1 text-sm font-black italic uppercase">
                <productivityStatus.icon size={14} />
                {productivityStatus.label}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* --- Today's Quest --- */}
        <section id="today-quest" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2 text-white">
              <Sword className="text-blue-500" size={20} />
              Active Quests
            </h2>
            <button 
              onClick={() => setIsAdding(true)}
              className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-95"
            >
              <Plus size={20} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AnimatePresence mode="popLayout">
              {habits.map((habit) => {
                const isCompleted = logs.some(l => l.habitId === habit.id && l.date === today && l.completed);
                return (
                  <motion.div
                    key={habit.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={() => toggleHabit(habit.id)}
                    className={cn(
                      "relative group cursor-pointer p-4 rounded-2xl border transition-all duration-300 overflow-hidden",
                      isCompleted 
                        ? "bg-slate-800/50 border-blue-500/50 shadow-inner" 
                        : "bg-slate-900 border-slate-800 hover:border-slate-700 hover:bg-slate-800/30"
                    )}
                  >
                    <div className="flex items-center gap-4 relative z-10">
                      <div 
                        className="w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
                        style={{ backgroundColor: `${habit.color}20`, color: habit.color }}
                      >
                        <HabitIcon name={habit.icon} size={24} />
                      </div>
                      <div className="flex-1">
                        <h3 className={cn("font-bold transition-colors", isCompleted ? "text-slate-400 line-through" : "text-white")}>
                          {habit.name}
                        </h3>
                        <p className="text-xs text-slate-500 font-medium">
                          {isCompleted ? 'Quest Completed' : 'In Progress'}
                        </p>
                      </div>
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all",
                        isCompleted 
                          ? "bg-blue-500 border-blue-500 text-white" 
                          : "border-slate-700 text-transparent group-hover:border-slate-500"
                      )}>
                        <CheckCircle2 size={18} />
                      </div>
                    </div>
                    {isCompleted && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent pointer-events-none"
                      />
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {habits.length === 0 && !isAdding && (
              <div className="col-span-full py-12 flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-slate-800 rounded-3xl">
                <Zap size={48} className="mb-4 opacity-20" />
                <p className="font-bold">No quests active.</p>
                <p className="text-sm">Add a habit to start your journey!</p>
              </div>
            )}
          </div>
        </section>

        {/* --- Stats Section --- */}
        <section id="stats" className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Weekly Progress */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2 text-white">
                <BarChart3 className="text-purple-500" size={18} />
                Weekly Momentum
              </h3>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Last 7 Days</div>
            </div>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyData}>
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold' }} 
                    dy={10}
                  />
                  <Tooltip 
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)' }}
                    itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                  />
                  <Bar dataKey="percentage" radius={[6, 6, 0, 0]}>
                    {weeklyData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.percentage > 80 ? '#3b82f6' : entry.percentage > 40 ? '#8b5cf6' : '#475569'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Monthly Trend */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2 text-white">
                <TrendingUp className="text-blue-500" size={18} />
                Growth Curve
              </h3>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Last 30 Days</div>
            </div>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyData}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px' }}
                    itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="count" 
                    stroke="#3b82f6" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorCount)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* --- Productivity Summary --- */}
        <section className="bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-blue-500/20 rounded-3xl p-8 flex flex-col items-center text-center space-y-4">
          <div className="w-20 h-20 rounded-full bg-slate-900 flex items-center justify-center border-4 border-blue-500/30 shadow-2xl">
            <Star className="text-yellow-400" size={40} fill="currentColor" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white italic uppercase tracking-tight">
              {todayCompletionRate === 100 ? 'Ascension Reached!' : todayCompletionRate > 50 ? 'Path of the Warrior' : 'The Journey Begins'}
            </h2>
            <p className="text-slate-400 max-w-xs mx-auto mt-2">
              {todayCompletionRate === 100 
                ? "You've conquered every quest today. Your power grows!" 
                : todayCompletionRate > 0 
                  ? `You've completed ${todayCompletionRate}% of your journey today. Keep pushing!` 
                  : "The first step is always the hardest. Choose your quest."}
            </p>
          </div>
          <div className="flex gap-4">
            <div className="bg-slate-900/50 px-4 py-2 rounded-2xl border border-slate-800">
              <div className="text-[10px] font-bold text-slate-500 uppercase">Daily XP</div>
              <div className="text-lg font-black text-blue-400">+{logs.filter(l => l.date === today && l.completed).length * XP_PER_HABIT}</div>
            </div>
            <div className="bg-slate-900/50 px-4 py-2 rounded-2xl border border-slate-800">
              <div className="text-[10px] font-bold text-slate-500 uppercase">Quests</div>
              <div className="text-lg font-black text-purple-400">{logs.filter(l => l.date === today && l.completed).length} / {habits.length}</div>
            </div>
          </div>
        </section>
      </main>

      {/* --- Add Habit Modal --- */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
            >
              <h2 className="text-2xl font-black text-white mb-6 flex items-center gap-2">
                <Zap className="text-yellow-400" />
                New Quest
              </h2>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Quest Name</label>
                  <input 
                    autoFocus
                    type="text" 
                    value={newHabitName}
                    onChange={(e) => setNewHabitName(e.target.value)}
                    placeholder="e.g. Daily Meditation"
                    className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-bold"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Icon</label>
                  <div className="flex flex-wrap gap-2">
                    {['Zap', 'Sword', 'Shield', 'Star', 'Flame', 'Trophy', 'Zap', 'Sword'].map((icon, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedIcon(icon)}
                        className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center border transition-all",
                          selectedIcon === icon ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                        )}
                      >
                        <HabitIcon name={icon} size={18} />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Color Aura</label>
                  <div className="flex gap-3">
                    {['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'].map(color => (
                      <button
                        key={color}
                        onClick={() => setSelectedColor(color)}
                        className={cn(
                          "w-8 h-8 rounded-full border-2 transition-all",
                          selectedColor === color ? "border-white scale-110" : "border-transparent opacity-50 hover:opacity-100"
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setIsAdding(false)}
                    className="flex-1 py-4 rounded-2xl font-bold text-slate-400 hover:bg-slate-800 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={addHabit}
                    disabled={!newHabitName.trim()}
                    className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-bold transition-all shadow-lg shadow-blue-600/20"
                  >
                    Start Quest
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HabitIcon({ name, size }: { name: string, size: number }) {
  switch (name) {
    case 'Zap': return <Zap size={size} />;
    case 'Sword': return <Sword size={size} />;
    case 'Shield': return <Shield size={size} />;
    case 'Star': return <Star size={size} />;
    case 'Flame': return <Flame size={size} />;
    case 'Trophy': return <Trophy size={size} />;
    default: return <Zap size={size} />;
  }
}

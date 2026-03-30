/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays, 
  eachDayOfInterval,
  parseISO
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Settings, 
  LogOut, 
  Calendar as CalendarIcon,
  Calculator,
  Save,
  Trash2,
  X,
  User as UserIcon,
  TrendingUp,
  Wallet
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, signInWithGoogle, logout } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  query, 
  where, 
  deleteDoc, 
  serverTimestamp,
  getDocFromServer
} from 'firebase/firestore';
import { cn } from './lib/utils';
import { UserProfile, WorkLog, FirestoreErrorInfo } from './types';

// --- Error Handling ---
function handleFirestoreError(error: unknown, operationType: string, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email || undefined,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType: operationType as any,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Components ---

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="bg-white p-6 rounded-2xl shadow-xl max-w-md w-full border border-red-100">
          <h2 className="text-2xl font-bold text-red-600 mb-4">문제가 발생했습니다</h2>
          <p className="text-gray-600 mb-6">{errorMsg || '알 수 없는 오류가 발생했습니다.'}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors"
          >
            다시 시도하기
          </button>
        </div>
      </div>
    );
  }

  return (
    <React.Suspense fallback={<div>Loading...</div>}>
      {children}
    </React.Suspense>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCustomInput, setIsCustomInput] = useState(false);
  const [customGongsu, setCustomGongsu] = useState('');

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Fetch profile
        try {
          const docRef = doc(db, 'users', u.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          } else {
            const newProfile: UserProfile = {
              uid: u.uid,
              displayName: u.displayName,
              email: u.email,
              dailyRate: 150000,
              taxRate: 3.3
            };
            await setDoc(docRef, newProfile);
            setProfile(newProfile);
          }
        } catch (err) {
          console.error("Profile fetch error", err);
        }
      } else {
        setProfile(null);
        setWorkLogs([]);
      }
      setIsLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!selectedDate) {
      setIsCustomInput(false);
      setCustomGongsu('');
    }
  }, [selectedDate]);

  // Work Logs Listener
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'workLogs'), where('uid', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WorkLog));
      setWorkLogs(logs);
    }, (err) => {
      handleFirestoreError(err, 'list', 'workLogs');
    });
    return unsubscribe;
  }, [user]);

  // Connection Test
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();
  }, []);

  // Calculations
  const monthlyStats = useMemo(() => {
    const monthStr = format(currentMonth, 'yyyy-MM');
    const logs = workLogs.filter(log => log.date.startsWith(monthStr));
    const totalGongsu = logs.reduce((sum, log) => sum + log.gongsu, 0);
    const dailyRate = profile?.dailyRate || 0;
    const totalPay = totalGongsu * dailyRate;
    const taxAmount = totalPay * ((profile?.taxRate || 0) / 100);
    const netPay = totalPay - taxAmount;

    return { totalGongsu, totalPay, netPay, logs };
  }, [workLogs, currentMonth, profile]);

  const handleAddLog = async (gongsu: number) => {
    if (!user || !selectedDate) return;
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const existingLog = workLogs.find(l => l.date === dateStr);
    
    try {
      if (existingLog) {
        await setDoc(doc(db, 'workLogs', existingLog.id!), {
          ...existingLog,
          gongsu,
          createdAt: serverTimestamp()
        });
      } else {
        const newLogRef = doc(collection(db, 'workLogs'));
        await setDoc(newLogRef, {
          uid: user.uid,
          date: dateStr,
          gongsu,
          createdAt: serverTimestamp()
        });
      }
      setSelectedDate(null);
      setIsCustomInput(false);
      setCustomGongsu('');
    } catch (err) {
      handleFirestoreError(err, 'write', 'workLogs');
    }
  };

  const handleDeleteLog = async () => {
    if (!user || !selectedDate) return;
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const existingLog = workLogs.find(l => l.date === dateStr);
    if (!existingLog) {
      setSelectedDate(null);
      return;
    }
    try {
      await deleteDoc(doc(db, 'workLogs', existingLog.id!));
      setSelectedDate(null);
    } catch (err) {
      handleFirestoreError(err, 'delete', 'workLogs');
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !profile) return;
    try {
      await setDoc(doc(db, 'users', user.uid), profile);
      setIsSettingsOpen(false);
    } catch (err) {
      handleFirestoreError(err, 'write', 'users');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Background Accents */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-100 rounded-full blur-[100px] opacity-50" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-100 rounded-full blur-[100px] opacity-50" />

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/80 backdrop-blur-xl p-10 rounded-[40px] shadow-2xl max-w-sm w-full text-center border border-white relative z-10"
        >
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className="w-24 h-24 bg-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-blue-200 rotate-6"
          >
            <Calculator className="w-12 h-12 text-white" />
          </motion.div>
          
          <h1 className="text-4xl font-black text-slate-900 mb-3 tracking-tight">공수 플러스</h1>
          <p className="text-slate-500 font-medium mb-10 leading-relaxed">
            현장 근로자를 위한<br />
            <span className="text-blue-600 font-bold">가장 스마트한</span> 공수 관리 시스템
          </p>

          <div className="space-y-4">
            <button 
              onClick={signInWithGoogle}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-slate-800 transition-all active:scale-95 shadow-xl"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/action/google.svg" className="w-6 h-6 bg-white rounded-full p-1" alt="Google" />
              구글로 3초만에 시작하기
            </button>
            <p className="text-[11px] text-slate-400 font-medium">
              로그인 시 데이터가 안전하게 클라우드에 보관됩니다.
            </p>
          </div>
        </motion.div>

        <footer className="absolute bottom-8 text-slate-400 text-xs font-bold tracking-widest uppercase">
          © 2026 Gongsu Plus Professional
        </footer>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-24">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200 rotate-3">
                <Calculator className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-black tracking-tight text-slate-900 leading-none">공수 플러스</h1>
                <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wider">Professional Log</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex flex-col items-end mr-2">
                <span className="text-sm font-bold text-slate-900">{user.displayName}님</span>
                <span className="text-[10px] text-slate-400 font-medium">{user.email}</span>
              </div>
              {user.photoURL ? (
                <img src={user.photoURL} alt="profile" className="w-10 h-10 rounded-full border-2 border-slate-100 object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center border-2 border-slate-200">
                  <UserIcon className="w-5 h-5 text-slate-400" />
                </div>
              )}
              <div className="h-6 w-[1px] bg-slate-200 mx-1" />
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                title="설정"
              >
                <Settings className="w-6 h-6" />
              </button>
              <button 
                onClick={() => {
                  if(confirm('로그아웃 하시겠습니까?')) logout();
                }}
                className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                title="로그아웃"
              >
                <LogOut className="w-6 h-6" />
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto p-4 space-y-6">
          {/* Summary Cards */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <motion.div 
              whileHover={{ y: -4 }}
              className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-slate-500 font-medium text-sm">이번 달 총 공수</span>
                <TrendingUp className="w-5 h-5 text-blue-500" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-blue-600">{monthlyStats.totalGongsu}</span>
                <span className="text-slate-400 font-bold">공수</span>
              </div>
            </motion.div>

            <motion.div 
              whileHover={{ y: -4 }}
              className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-slate-500 font-medium text-sm">예상 총 급여</span>
                <Wallet className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-slate-900">{monthlyStats.totalPay.toLocaleString()}</span>
                <span className="text-slate-400 font-bold text-sm">원</span>
              </div>
            </motion.div>

            <motion.div 
              whileHover={{ y: -4 }}
              className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-slate-500 font-medium text-sm">실수령액 (세후)</span>
                <Calculator className="w-5 h-5 text-orange-500" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-emerald-600">{Math.floor(monthlyStats.netPay).toLocaleString()}</span>
                <span className="text-slate-400 font-bold text-sm">원</span>
              </div>
            </motion.div>
          </section>

          {/* Calendar Section */}
          <section className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 flex items-center justify-between border-b border-slate-100">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <CalendarIcon className="w-6 h-6 text-blue-600" />
                {format(currentMonth, 'yyyy년 M월', { locale: ko })}
              </h2>
              <div className="flex gap-2">
                <button 
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button 
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-4">
              <div className="grid grid-cols-7 mb-2">
                {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
                  <div key={day} className={cn(
                    "text-center text-xs font-bold py-2",
                    i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-slate-400"
                  )}>
                    {day}
                  </div>
                ))}
              </div>
              
              <div className="grid grid-cols-7 gap-1">
                {(() => {
                  const monthStart = startOfMonth(currentMonth);
                  const monthEnd = endOfMonth(monthStart);
                  const startDate = startOfWeek(monthStart);
                  const endDate = endOfWeek(monthEnd);
                  const dateRange = eachDayOfInterval({ start: startDate, end: endDate });

                  return dateRange.map((day, i) => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const log = workLogs.find(l => l.date === dateStr);
                    const isToday = isSameDay(day, new Date());
                    const isCurrentMonth = isSameMonth(day, monthStart);

                    return (
                      <button
                        key={dateStr}
                        onClick={() => setSelectedDate(day)}
                        className={cn(
                          "aspect-square relative flex flex-col items-center justify-center rounded-2xl transition-all p-1",
                          !isCurrentMonth && "opacity-20",
                          isToday && "bg-blue-50 ring-2 ring-blue-600 ring-inset",
                          !isToday && isCurrentMonth && "hover:bg-slate-50",
                          log && "bg-blue-600 text-white shadow-md"
                        )}
                      >
                        <span className={cn(
                          "text-sm font-bold",
                          !log && i % 7 === 0 && "text-red-500",
                          !log && i % 7 === 6 && "text-blue-500"
                        )}>
                          {format(day, 'd')}
                        </span>
                        {log && (
                          <span className="text-[10px] font-black mt-1">
                            {log.gongsu === 0 ? '휴무' : log.gongsu}
                          </span>
                        )}
                      </button>
                    );
                  });
                })()}
              </div>
            </div>
          </section>
        </main>

        {/* Floating Action Button (Mobile) */}
        <div className="fixed bottom-6 right-6 md:hidden">
          <button 
            onClick={() => setSelectedDate(new Date())}
            className="w-16 h-16 bg-blue-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all"
          >
            <Plus className="w-8 h-8" />
          </button>
        </div>

        {/* Date Picker Modal */}
        <AnimatePresence>
          {selectedDate && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedDate(null)}
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                className="relative bg-white w-full max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl p-8"
              >
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-2xl font-black text-slate-900">공수 입력</h3>
                    <p className="text-slate-500 font-medium">{format(selectedDate, 'yyyy년 M월 d일 (eee)', { locale: ko })}</p>
                  </div>
                  <button onClick={() => setSelectedDate(null)} className="p-2 hover:bg-slate-100 rounded-full">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-8">
                  {[0.5, 1.0, 1.5, 2.0].map(val => (
                    <button
                      key={val}
                      onClick={() => handleAddLog(val)}
                      className="py-6 rounded-2xl border-2 border-slate-100 hover:border-blue-600 hover:bg-blue-50 transition-all flex flex-col items-center justify-center gap-1 group"
                    >
                      <span className="text-2xl font-black text-slate-900 group-hover:text-blue-600">{val}</span>
                      <span className="text-xs font-bold text-slate-400 group-hover:text-blue-400">공수</span>
                    </button>
                  ))}
                  
                  <button
                    onClick={() => handleAddLog(0)}
                    className="py-6 rounded-2xl border-2 border-slate-100 hover:border-blue-600 hover:bg-blue-50 transition-all flex flex-col items-center justify-center gap-1 group"
                  >
                    <span className="text-2xl font-black text-slate-900 group-hover:text-blue-600">휴무</span>
                    <span className="text-xs font-bold text-slate-400 group-hover:text-blue-400">0 공수</span>
                  </button>

                  <button
                    onClick={() => setIsCustomInput(true)}
                    className="py-6 rounded-2xl border-2 border-slate-100 hover:border-blue-600 hover:bg-blue-50 transition-all flex flex-col items-center justify-center gap-1 group"
                  >
                    <span className="text-xl font-black text-slate-900 group-hover:text-blue-600">직접입력</span>
                    <span className="text-xs font-bold text-slate-400 group-hover:text-blue-400">숫자 입력</span>
                  </button>

                  {isCustomInput && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="col-span-2 p-4 bg-slate-50 rounded-2xl border-2 border-blue-100"
                    >
                      <div className="flex gap-2">
                        <input 
                          type="number" 
                          step="0.1"
                          autoFocus
                          value={customGongsu}
                          onChange={(e) => setCustomGongsu(e.target.value)}
                          placeholder="공수 입력 (예: 2.5)"
                          className="flex-1 px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-blue-600 focus:outline-none font-bold"
                        />
                        <button 
                          onClick={() => {
                            const val = parseFloat(customGongsu);
                            if (!isNaN(val)) {
                              handleAddLog(val);
                              setCustomGongsu('');
                              setIsCustomInput(false);
                            }
                          }}
                          className="px-6 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors"
                        >
                          확인
                        </button>
                      </div>
                    </motion.div>
                  )}

                  <button
                    onClick={handleDeleteLog}
                    className="col-span-2 py-4 rounded-2xl bg-red-50 text-red-600 font-bold flex items-center justify-center gap-2 hover:bg-red-100 transition-all"
                  >
                    <Trash2 className="w-5 h-5" />
                    기록 삭제
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Settings Modal */}
        <AnimatePresence>
          {isSettingsOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsSettingsOpen(false)}
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl p-8"
              >
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                    <Settings className="w-8 h-8 text-blue-600" />
                    설정
                  </h3>
                  <button onClick={() => setIsSettingsOpen(false)} className="p-2 hover:bg-slate-100 rounded-full">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <form onSubmit={handleUpdateProfile} className="space-y-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-500 mb-2">기본 일당 (단가)</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        value={profile?.dailyRate || 0}
                        onChange={(e) => setProfile(p => p ? { ...p, dailyRate: Number(e.target.value) } : null)}
                        className="w-full pl-6 pr-12 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-600 focus:outline-none font-bold text-lg"
                        placeholder="예: 150000"
                      />
                      <span className="absolute right-6 top-1/2 -translate-y-1/2 font-bold text-slate-400">원</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-500 mb-2">세율 (%)</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        step="0.1"
                        value={profile?.taxRate || 0}
                        onChange={(e) => setProfile(p => p ? { ...p, taxRate: Number(e.target.value) } : null)}
                        className="w-full pl-6 pr-12 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-600 focus:outline-none font-bold text-lg"
                        placeholder="예: 3.3"
                      />
                      <span className="absolute right-6 top-1/2 -translate-y-1/2 font-bold text-slate-400">%</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-400 font-medium">* 일반적인 일용직은 3.3%를 적용합니다.</p>
                  </div>

                  <button 
                    type="submit"
                    className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-lg"
                  >
                    <Save className="w-5 h-5" />
                    저장하기
                  </button>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}

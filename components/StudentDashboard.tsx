
import React, { useState, useEffect } from 'react';
import { User, Subject, StudentTab, SystemSettings, CreditPackage, WeeklyTest, Chapter, MCQItem, Challenge20 } from '../types';
import { updateUserStatus, db, saveUserToLive, getChapterData, rtdb, saveAiInteraction } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { ref, query, limitToLast, onValue } from 'firebase/database';
import { getSubjectsList, DEFAULT_APP_FEATURES, ALL_APP_FEATURES } from '../constants';
import { getActiveChallenges } from '../services/questionBank';
import { generateDailyChallengeQuestions } from '../utils/challengeGenerator';
import { generateMorningInsight } from '../services/morningInsight';
import { RedeemSection } from './RedeemSection';
import { PrizeList } from './PrizeList';
import { Store } from './Store';
import { Layout, Gift, Sparkles, Megaphone, Lock, BookOpen, AlertCircle, Edit, Settings, Play, Pause, RotateCcw, MessageCircle, Gamepad2, Timer, CreditCard, Send, CheckCircle, Mail, X, Ban, Smartphone, Trophy, ShoppingBag, ArrowRight, Video, Youtube, Home, User as UserIcon, Book, BookOpenText, List, BarChart3, Award, Bell, Headphones, LifeBuoy, WifiOff, Zap, Star, Crown, History, ListChecks, Rocket, Ticket, TrendingUp, BrainCircuit, Bot, ChevronUp } from 'lucide-react';
import { SubjectSelection } from './SubjectSelection';
import { BannerCarousel } from './BannerCarousel';
import { ChapterSelection } from './ChapterSelection'; // Imported for Video Flow
import { VideoPlaylistView } from './VideoPlaylistView'; // Imported for Video Flow
import { AudioPlaylistView } from './AudioPlaylistView'; // Imported for Audio Flow
import { PdfView } from './PdfView'; // Imported for PDF Flow
import { McqView } from './McqView'; // Imported for MCQ Flow
import { MiniPlayer } from './MiniPlayer'; // Imported for Audio Flow
import { HistoryPage } from './HistoryPage';
import { Leaderboard } from './Leaderboard';
import { SpinWheel } from './SpinWheel';
import { fetchChapters, generateCustomNotes } from '../services/groq'; // Needed for Video Flow
import { FileText, CheckSquare } from 'lucide-react'; // Icons
import { LoadingOverlay } from './LoadingOverlay';
import { CreditConfirmationModal } from './CreditConfirmationModal';
import { UserGuide } from './UserGuide';
import { CustomAlert } from './CustomDialogs';
import { AnalyticsPage } from './AnalyticsPage';
import { LiveResultsFeed } from './LiveResultsFeed';
import { UniversalInfoPage } from './UniversalInfoPage';
import { UniversalChat } from './UniversalChat';
import { AiHistoryPage } from './AiHistoryPage';
import { ExpiryPopup } from './ExpiryPopup';
import { SubscriptionHistory } from './SubscriptionHistory';
import { MonthlyMarksheet } from './MonthlyMarksheet';
import { SearchResult } from '../utils/syllabusSearch';
import { AiDeepAnalysis } from './AiDeepAnalysis';
import { CustomBloggerPage } from './CustomBloggerPage';
import { ReferralPopup } from './ReferralPopup';
import { StudentAiAssistant } from './StudentAiAssistant';
import { SpeakButton } from './SpeakButton';
import { StudyTimer } from './StudyTimer';
import { LiveProgressRing } from './LiveProgressRing';
import { storage } from '../utils/storage';
import { playAudioGuide, playWelcomeMessage, isAudioEnabled, toggleAudio, getIndianVoices, setPreferredVoice } from '../utils/textToSpeech';

interface Props {
  user: User;
  dailyStudySeconds: number; // Received from Global App
  onSubjectSelect: (subject: Subject) => void;
  onRedeemSuccess: (user: User) => void;
  settings?: SystemSettings; // New prop
  onStartWeeklyTest?: (test: WeeklyTest) => void;
  activeTab: StudentTab;
  onTabChange: (tab: StudentTab) => void;
  setFullScreen: (full: boolean) => void; // Passed from App
  onNavigate?: (view: 'ADMIN_DASHBOARD') => void; // Added for Admin Switch
  isImpersonating?: boolean;
  onNavigateToChapter?: (chapterId: string, chapterTitle: string, subjectName: string, classLevel?: string) => void;
  isDarkMode?: boolean;
  onToggleDarkMode?: (v: boolean) => void;
}

export const StudentDashboard: React.FC<Props> = ({ user, dailyStudySeconds, onSubjectSelect, onRedeemSuccess, settings, onStartWeeklyTest, activeTab, onTabChange, setFullScreen, onNavigate, isImpersonating, onNavigateToChapter, isDarkMode, onToggleDarkMode }) => {
  
  // CUSTOM ALERT STATE
  const [alertConfig, setAlertConfig] = useState<{isOpen: boolean, type: 'SUCCESS'|'ERROR'|'INFO', title?: string, message: string}>({isOpen: false, type: 'INFO', message: ''});
  const showAlert = (msg: string, type: 'SUCCESS'|'ERROR'|'INFO' = 'INFO', title?: string) => {
      setAlertConfig({ isOpen: true, type, title, message: msg });
  };

  // VOICE & WELCOME
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
      getIndianVoices().then(setAvailableVoices);
      // Short delay to ensure browser readiness
      setTimeout(() => playWelcomeMessage(user.name, false), 1000);
  }, []);

  // NEW NOTIFICATION LOGIC
  const [hasNewUpdate, setHasNewUpdate] = useState(false);
  useEffect(() => {
      const q = query(ref(rtdb, 'universal_updates'), limitToLast(1));
      const unsub = onValue(q, async snap => {
          const data = snap.val();
          if (data) {
              const latest = Object.values(data)[0] as any;
              const lastRead = await storage.getItem('nst_last_read_update') || '0';
              if (new Date(latest.timestamp).getTime() > Number(lastRead)) {
                  setHasNewUpdate(true);
                      // IMMEDIATE ALERT FOR NEW UPDATE
                      const alertKey = `nst_update_alert_shown_${latest.id}`;
                      const shown = await storage.getItem(alertKey);
                      if (!shown) {
                          showAlert(`New Content Available: ${latest.text}`, 'INFO', 'New Update');
                          storage.setItem(alertKey, 'true');
                      }
              } else {
                  setHasNewUpdate(false);
              }
          }
      });
      return () => unsub();
  }, []);

  const [testAttempts, setTestAttempts] = useState<Record<string, any>>({});
  useEffect(() => {
      storage.getItem(`nst_test_attempts_${user.id}`).then(d => {
          if(d) setTestAttempts(JSON.parse(d));
      });
  }, [user.id]);

  const [activeExternalApp, setActiveExternalApp] = useState<string | null>(null);
  const [pendingApp, setPendingApp] = useState<{app: any, cost: number} | null>(null);
  const [contentViewStep, setContentViewStep] = useState<'SUBJECTS' | 'CHAPTERS' | 'PLAYER'>('SUBJECTS');
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [syllabusMode, setSyllabusMode] = useState<'SCHOOL' | 'COMPETITION'>('SCHOOL');
  const [currentAudioTrack, setCurrentAudioTrack] = useState<{url: string, title: string} | null>(null);

  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [isDataReady, setIsDataReady] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [profileData, setProfileData] = useState({
      classLevel: user.classLevel || '10',
      board: user.board || 'CBSE',
      stream: user.stream || 'Science',
      newPassword: '',
      dailyGoalHours: 3 
  });

  const [canClaimReward, setCanClaimReward] = useState(false);
  const [showUserGuide, setShowUserGuide] = useState(false);
  const [showNameChangeModal, setShowNameChangeModal] = useState(false);
  const [newNameInput, setNewNameInput] = useState('');
  
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [isLayoutEditing, setIsLayoutEditing] = useState(false);
  const [showExpiryPopup, setShowExpiryPopup] = useState(false);
  const [showMonthlyReport, setShowMonthlyReport] = useState(false);
  const [showReferralPopup, setShowReferralPopup] = useState(false);

  // --- REFERRAL POPUP CHECK ---
  useEffect(() => {
      const checkReferral = async () => {
          const isNew = (Date.now() - new Date(user.createdAt).getTime()) < 10 * 60 * 1000; // 10 mins window
          const shown = await storage.getItem(`referral_shown_${user.id}`);
          if (isNew && !user.redeemedReferralCode && !shown) {
              setShowReferralPopup(true);
              storage.setItem(`referral_shown_${user.id}`, 'true');
          }
      };
      checkReferral();
  }, [user.id, user.createdAt, user.redeemedReferralCode]);

  const handleSupportEmail = () => {
    const email = "nadim841442@gmail.com";
    const subject = encodeURIComponent(`Support Request: ${user.name} (ID: ${user.id})`);
    const body = encodeURIComponent(`Student Details:\nName: ${user.name}\nUID: ${user.id}\nEmail: ${user.email}\n\nIssue Description:\n`);
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  };
  
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestData, setRequestData] = useState({ subject: '', topic: '', type: 'PDF' });

  const [showAiModal, setShowAiModal] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);

  const [dailyTargetSeconds, setDailyTargetSeconds] = useState(3 * 3600);
  const REWARD_AMOUNT = settings?.dailyReward || 3;
  
  const adminPhones = settings?.adminPhones || [{id: 'default', number: '8227070298', name: 'Admin'}];
  
  // --- CHALLENGE 2.0 LOGIC ---
  const [challenges20, setChallenges20] = useState<Challenge20[]>([]);
  useEffect(() => {
      const loadChallenges = async () => {
          if (user.classLevel) {
              const active = await getActiveChallenges(user.classLevel);
              setChallenges20(active);
          }
      };
      loadChallenges();
      const interval = setInterval(loadChallenges, 60000);
      return () => clearInterval(interval);
  }, [user.classLevel]);

  const startChallenge20 = (challenge: Challenge20) => {
      const safeQuestions = Array.isArray(challenge.questions) ? challenge.questions : [];
      const mappedTest: WeeklyTest = {
          id: challenge.id,
          name: challenge.title,
          description: challenge.description || '2.0 Challenge',
          isActive: true,
          classLevel: challenge.classLevel,
          questions: safeQuestions,
          totalQuestions: safeQuestions.length,
          passingScore: Math.ceil(safeQuestions.length * 0.5),
          createdAt: challenge.createdAt,
          durationMinutes: challenge.durationMinutes || (challenge.type === 'DAILY_CHALLENGE' ? 15 : 60),
          autoSubmitEnabled: true
      };
      if (onStartWeeklyTest) onStartWeeklyTest(mappedTest);
  };

  // --- MORNING INSIGHT ---
  const [morningBanner, setMorningBanner] = useState<any>(null);
  useEffect(() => {
      const loadMorningInsight = async () => {
          const now = new Date();
          if (now.getHours() >= 10) {
              const today = now.toDateString();
              const savedBanner = await storage.getItem('nst_morning_banner');
              
              if (savedBanner) {
                  const parsed = savedBanner;
                  if (parsed.date === today) {
                      setMorningBanner(parsed);
                      return;
                  }
              }

              const isGen = await storage.getItem(`nst_insight_gen_${today}`);
              if (!isGen) {
                  await storage.setItem(`nst_insight_gen_${today}`, 'true');
                  try {
                      const logs = await storage.getItem<any[]>('nst_universal_analysis_logs') || [];
                      if (logs.length === 0) return;

                      await generateMorningInsight(
                          logs, 
                          settings, 
                          (banner) => {
                              storage.setItem('nst_morning_banner', banner);
                              setMorningBanner(banner);
                          }
                      );
                  } catch (e) {
                      console.error("Insight Gen Failed", e);
                      storage.removeItem(`nst_insight_gen_${today}`);
                  }
              }
          }
      };
      loadMorningInsight();
  }, [user.role, settings]);

  const startAutoChallenge = async (type: 'DAILY' | 'WEEKLY') => {
      const key = type === 'DAILY' ? 'daily_challenge_data' : 'weekly_challenge_data';
      const stored = await storage.getItem<any>(key);
      if (stored) {
          const challenge = stored;
          const mappedTest: WeeklyTest = {
              id: challenge.id,
              name: challenge.name,
              description: type === 'DAILY' ? 'Daily Mixed Practice' : 'Weekly Mega Test',
              isActive: true,
              classLevel: user.classLevel || '10',
              questions: challenge.questions,
              totalQuestions: challenge.questions.length,
              passingScore: Math.ceil(challenge.questions.length * 0.5),
              createdAt: new Date().toISOString(),
              durationMinutes: challenge.durationMinutes,
              autoSubmitEnabled: true
          };
          if (onStartWeeklyTest) onStartWeeklyTest(mappedTest);
      } else {
          showAlert("Challenge not ready yet. Please try again later.", "INFO");
      }
  };

  const handleAiNotesGeneration = async () => {
      if (!aiTopic.trim()) {
          showAlert("Please enter a topic!", "ERROR");
          return;
      }

      const today = new Date().toDateString();
      const usageKey = `nst_ai_usage_${user.id}_${today}`;
      const storedUsage = await storage.getItem<string>(usageKey);
      const currentUsage = parseInt(storedUsage || '0');
      
      let limit = settings?.aiLimits?.free || 0;
      if (user.subscriptionLevel === 'BASIC' && user.isPremium) limit = settings?.aiLimits?.basic || 0;
      if (user.subscriptionLevel === 'ULTRA' && user.isPremium) limit = settings?.aiLimits?.ultra || 0;

      if (currentUsage >= limit) {
          showAlert(`Daily Limit Reached! Used ${currentUsage}/${limit} generations.`, "ERROR");
          return;
      }

      setAiGenerating(true);
      try {
          const notes = await generateCustomNotes(aiTopic, settings?.aiNotesPrompt || '', settings?.aiModel);
          setAiResult(notes);
          
          storage.setItem(usageKey, (currentUsage + 1).toString());

          saveAiInteraction({
              id: `ai-note-${Date.now()}`,
              userId: user.id,
              userName: user.name,
              type: 'AI_NOTES',
              query: aiTopic,
              response: notes,
              timestamp: new Date().toISOString()
          });

          showAlert("Notes Generated Successfully!", "SUCCESS");
      } catch (e) {
          console.error(e);
          showAlert("Failed to generate notes. Please try again.", "ERROR");
      } finally {
          setAiGenerating(false);
      }
  };

  const handleSwitchToAdmin = () => {
    if (onNavigate) {
       onNavigate('ADMIN_DASHBOARD');
    }
  };

  const toggleLayoutVisibility = (sectionId: string) => {
      if (!settings) return;
      const currentLayout = settings.dashboardLayout || {};
      const currentConfig = currentLayout[sectionId] || { id: sectionId, visible: true };
      
      const newLayout = {
          ...currentLayout,
          [sectionId]: { ...currentConfig, visible: !currentConfig.visible }
      };
      
      const newSettings = { ...settings, dashboardLayout: newLayout };
      storage.setItem('nst_system_settings', newSettings);
      window.location.reload(); 
  };
  
  const getPhoneNumber = (phoneId?: string) => {
    const phone = adminPhones.find(p => p.id === (phoneId || 'default'));
    return phone ? phone.number : '8227070298';
  };

  useEffect(() => {
      const loadGoal = async () => {
          const storedGoal = await storage.getItem<string>(`nst_goal_${user.id}`);
          if (storedGoal) {
              const hours = parseInt(storedGoal);
              setDailyTargetSeconds(hours * 3600);
              setProfileData(prev => ({...prev, dailyGoalHours: hours}));
          }
      };
      loadGoal();
  }, [user.id]);

  useEffect(() => {
    if (!user.id) return;
    const unsub = onSnapshot(doc(db, "users", user.id), (doc) => {
        if (doc.exists()) {
            const cloudData = doc.data() as User;
            if (cloudData.credits !== user.credits || 
                cloudData.subscriptionTier !== user.subscriptionTier ||
                cloudData.isPremium !== user.isPremium ||
                cloudData.isGameBanned !== user.isGameBanned) {
                const updated = { ...user, ...cloudData };
                onRedeemSuccess(updated); 
            }
        }
    });
    return () => unsub();
  }, [user.id]); 

  useEffect(() => {
      const interval = setInterval(async () => {
          updateUserStatus(user.id, dailyStudySeconds);
          const todayStr = new Date().toDateString();
          storage.setItem(`activity_${user.id}_${todayStr}`, dailyStudySeconds.toString());
          
          const accountAgeHours = (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60);
          const firstDayBonusClaimed = await storage.getItem(`first_day_ultra_${user.id}`);
          
          if (accountAgeHours < 24 && dailyStudySeconds >= 3600 && !firstDayBonusClaimed) {
              const endDate = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 Hour
              const updatedUser: User = { 
                  ...user, 
                  subscriptionTier: 'MONTHLY',
                  subscriptionEndDate: endDate,
                  isPremium: true
              };
              
              const storedUsers = await storage.getItem<User[]>('nst_users') || [];
              const idx = storedUsers.findIndex((u:User) => u.id === user.id);
              if (idx !== -1) storedUsers[idx] = updatedUser;
              
              storage.setItem('nst_users', storedUsers);
              storage.setItem('nst_current_user', updatedUser);
              storage.setItem(`first_day_ultra_${user.id}`, 'true');
              
              onRedeemSuccess(updatedUser);
              showAlert("🎉 FIRST DAY BONUS: You unlocked 1 Hour Free ULTRA Subscription!", 'SUCCESS');
          }
          
      }, 60000); 
      return () => clearInterval(interval);
  }, [dailyStudySeconds, user.id, user.createdAt]);

  const [showInbox, setShowInbox] = useState(false);
  const unreadCount = user.inbox?.filter(m => !m.read).length || 0;

  useEffect(() => {
    const today = new Date().toDateString();
    const lastClaim = user.lastRewardClaimDate ? new Date(user.lastRewardClaimDate).toDateString() : '';
    setCanClaimReward(lastClaim !== today && dailyStudySeconds >= dailyTargetSeconds);
  }, [user.lastRewardClaimDate, dailyStudySeconds, dailyTargetSeconds]);

  const claimDailyReward = () => {
      if (!canClaimReward) return;
      let finalReward = REWARD_AMOUNT;
      if (user.subscriptionLevel === 'BASIC' && user.isPremium) finalReward = 10;
      if (user.subscriptionLevel === 'ULTRA' && user.isPremium) finalReward = 20;

      const updatedUser = {
          ...user,
          credits: (user.credits || 0) + finalReward,
          lastRewardClaimDate: new Date().toISOString()
      };
      handleUserUpdate(updatedUser);
      setCanClaimReward(false);
      showAlert(`Received: ${finalReward} Free Credits!`, 'SUCCESS', 'Daily Goal Met');
  };

  const handleExternalAppClick = (app: any) => {
      if (app.isLocked) { showAlert("This app is currently locked by Admin.", 'ERROR'); return; }
      if (app.creditCost > 0) {
          if (user.credits < app.creditCost) { showAlert(`Insufficient Credits! You need ${app.creditCost} credits.`, 'ERROR'); return; }
          if (user.isAutoDeductEnabled) processAppAccess(app, app.creditCost);
          else setPendingApp({ app, cost: app.creditCost });
          return;
      }
      setActiveExternalApp(app.url);
  };

  const processAppAccess = (app: any, cost: number, enableAuto: boolean = false) => {
      let updatedUser = { ...user, credits: user.credits - cost };
      if (enableAuto) updatedUser.isAutoDeductEnabled = true;
      handleUserUpdate(updatedUser);
      setActiveExternalApp(app.url);
      setPendingApp(null);
  };

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const saveProfile = () => {
      const isPremium = user.isPremium && user.subscriptionEndDate && new Date(user.subscriptionEndDate) > new Date();
      const cost = settings?.profileEditCost ?? 10;
      
      if (!isPremium && user.credits < cost) {
          showAlert(`Profile update costs ${cost} NST Coins.\nYou have ${user.credits} coins.`, 'ERROR');
          return;
      }
      
      const updatedUser = { 
          ...user, 
          board: profileData.board,
          classLevel: profileData.classLevel,
          stream: profileData.stream,
          password: profileData.newPassword.trim() ? profileData.newPassword : user.password,
          credits: isPremium ? user.credits : user.credits - cost
      };
      storage.setItem(`nst_goal_${user.id}`, profileData.dailyGoalHours.toString());
      setDailyTargetSeconds(profileData.dailyGoalHours * 3600);
      handleUserUpdate(updatedUser);
      window.location.reload(); 
      setEditMode(false);
  };
  
  const handleUserUpdate = async (updatedUser: User) => {
      const storedUsers = await storage.getItem<User[]>('nst_users') || [];
      const userIdx = storedUsers.findIndex((u:User) => u.id === updatedUser.id);
      if (userIdx !== -1) {
          storedUsers[userIdx] = updatedUser;
          storage.setItem('nst_users', storedUsers);
          
          if (!isImpersonating) {
              storage.setItem('nst_current_user', updatedUser);
              saveUserToLive(updatedUser); 
          }
          onRedeemSuccess(updatedUser); 
      }
  };

  const markInboxRead = () => {
      if (!user.inbox) return;
      const updatedInbox = user.inbox.map(m => ({ ...m, read: true }));
      handleUserUpdate({ ...user, inbox: updatedInbox });
  };

  // --- GENERIC CONTENT FLOW HANDLERS ---
  const handleContentSubjectSelect = async (subject: Subject) => {
      setSelectedSubject(subject);
      setLoadingChapters(true);
      setContentViewStep('CHAPTERS');
      try {
          const ch = await fetchChapters(user.board || 'CBSE', user.classLevel || '10', user.stream || 'Science', subject, 'English');
          setChapters(ch);
      } catch(e) { console.error(e); }
      setLoadingChapters(false);
  };

  const [showSyllabusPopup, setShowSyllabusPopup] = useState<{
    subject: Subject;
    chapter: Chapter;
  } | null>(null);

  const handleContentChapterSelect = (chapter: Chapter) => {
    if (typeof (window as any).recordActivity === 'function') {
        const typeMap: Record<string, any> = {
            'VIDEO': 'VIDEO',
            'PDF': 'PDF',
            'MCQ': 'MCQ',
            'AUDIO': 'AUDIO'
        };
        const currentType = typeMap[activeTab] || 'VIEW';
        (window as any).recordActivity(currentType, chapter.title, 0, { 
            itemId: chapter.id, 
            subject: selectedSubject?.name || 'General' 
        });
    }

    setSelectedChapter(chapter);
    setContentViewStep('PLAYER');
    setFullScreen(true);
  };

  const confirmSyllabusSelection = (mode: 'SCHOOL' | 'COMPETITION') => {
    if (showSyllabusPopup) {
      setSyllabusMode(mode);
      setSelectedChapter(showSyllabusPopup.chapter);
      setContentViewStep('PLAYER');
      setFullScreen(true);
      setShowSyllabusPopup(null);
    }
  };

  const onLoadingComplete = () => {
      setIsLoadingContent(false);
      setContentViewStep('PLAYER');
      setFullScreen(true);
  };

  const renderContentSection = (type: 'VIDEO' | 'PDF' | 'MCQ' | 'AUDIO') => {
      const handlePlayerBack = () => {
          setContentViewStep('CHAPTERS');
          setFullScreen(false);
      };

      if (contentViewStep === 'PLAYER' && selectedChapter && selectedSubject) {
          if (type === 'VIDEO') {
            return <VideoPlaylistView chapter={selectedChapter} subject={selectedSubject} user={user} board={user.board || 'CBSE'} classLevel={user.classLevel || '10'} stream={user.stream || null} onBack={handlePlayerBack} onUpdateUser={handleUserUpdate} settings={settings} initialSyllabusMode={syllabusMode} />;
          } else if (type === 'PDF') {
            return <PdfView chapter={selectedChapter} subject={selectedSubject} user={user} board={user.board || 'CBSE'} classLevel={user.classLevel || '10'} stream={user.stream || null} onBack={handlePlayerBack} onUpdateUser={handleUserUpdate} settings={settings} initialSyllabusMode={syllabusMode} />;
          } else if (type === 'AUDIO') {
            return <AudioPlaylistView chapter={selectedChapter} subject={selectedSubject} user={user} board={user.board || 'CBSE'} classLevel={user.classLevel || '10'} stream={user.stream || null} onBack={handlePlayerBack} onUpdateUser={handleUserUpdate} settings={settings} onPlayAudio={setCurrentAudioTrack} initialSyllabusMode={syllabusMode} />;
          } else {
            return <McqView chapter={selectedChapter} subject={selectedSubject} user={user} board={user.board || 'CBSE'} classLevel={user.classLevel || '10'} stream={user.stream || null} onBack={handlePlayerBack} onUpdateUser={handleUserUpdate} settings={settings} />;
          }
      }

      if (contentViewStep === 'CHAPTERS' && selectedSubject) {
          return (
              <ChapterSelection 
                  chapters={chapters} 
                  subject={selectedSubject} 
                  classLevel={user.classLevel || '10'} 
                  loading={loadingChapters} 
                  user={user} 
                  settings={settings}
                  onSelect={(chapter, contentType) => {
                      setSelectedChapter(chapter);
                      if (contentType) {
                          setContentViewStep('PLAYER');
                          setFullScreen(true);
                      } else {
                          handleContentChapterSelect(chapter);
                      }
                  }} 
                  onBack={() => { setContentViewStep('SUBJECTS'); onTabChange('COURSES'); }} 
              />
          );
      }

      return null; 
  };

  const isGameEnabled = settings?.isGameEnabled ?? true;

  const DashboardSectionWrapper = ({ id, children, label }: { id: string, children: React.ReactNode, label: string }) => {
      const isVisible = settings?.dashboardLayout?.[id]?.visible !== false;
      if (!isVisible && !isLayoutEditing) return null;
      return (
          <div className={`relative ${isLayoutEditing ? 'border-2 border-dashed border-yellow-400 p-2 rounded-xl mb-4 bg-yellow-50/10' : ''}`}>
              {isLayoutEditing && (
                  <div className="absolute -top-3 left-2 bg-yellow-400 text-black text-[10px] font-bold px-2 py-0.5 rounded shadow z-50 flex items-center gap-2">
                      <span>{label}</span>
                      <button 
                          onClick={(e) => { e.stopPropagation(); toggleLayoutVisibility(id); }}
                          className={`px-2 py-0.5 rounded text-xs ${isVisible ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}
                      >
                          {isVisible ? 'ON' : 'OFF'}
                      </button>
                  </div>
              )}
              <div className={!isVisible ? 'opacity-50 grayscale pointer-events-none' : ''}>
                  {children}
              </div>
          </div>
      );
  };

  // --- RENDER BASED ON ACTIVE TAB ---
  const renderMainContent = () => {
      // 1. HOME TAB - 3-LAYER REDESIGN
      if (activeTab === 'HOME') { 
          return (
              <div className="space-y-6 pb-24">
                
                {/* 🥇 LAYER 1 - HERO DASHBOARD (Focus Mode) */}
                <div className="space-y-4">
                    {/* STUDY TIMER */}
                    <StudyTimer 
                        dailyStudySeconds={dailyStudySeconds} 
                        goalSeconds={dailyTargetSeconds} 
                        onSetGoal={(s) => {
                            setDailyTargetSeconds(s);
                            storage.setItem(`nst_goal_${user.id}`, (s/3600).toString());
                        }}
                    />

                    {/* LIVE PROGRESS RING */}
                    <LiveProgressRing 
                        dailySeconds={dailyStudySeconds}
                        weeklySeconds={0} // Ideally calculate real weekly seconds
                        streak={user.streak || 0}
                    />

                    {/* AI PERSONAL TUTOR HERO */}
                    <div 
                        onClick={() => setShowAiModal(true)}
                        className="relative bg-gradient-to-r from-violet-600 to-indigo-600 p-6 rounded-3xl shadow-xl overflow-hidden cursor-pointer group"
                    >
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10 animate-pulse"></div>
                        <div className="relative z-10 flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <Bot size={24} className="text-white" />
                                    <span className="bg-white/20 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest backdrop-blur-sm">Personal Tutor</span>
                                </div>
                                <h3 className="text-2xl font-black text-white leading-tight mb-1">Ask anything.</h3>
                                <p className="text-indigo-200 text-sm font-medium">AI will teach you instantly.</p>
                            </div>
                            <div className="bg-white p-3 rounded-full shadow-lg group-hover:scale-110 transition-transform">
                                <Sparkles size={24} className="text-indigo-600" />
                            </div>
                        </div>
                    </div>

                    {/* CONTINUE LEARNING & DAILY CHALLENGE GRID */}
                    <div className="grid grid-cols-2 gap-3">
                        <button 
                            onClick={() => {
                                // Default to continue last video or chapter if possible
                                onTabChange('VIDEO'); // Simple fallback
                            }}
                            className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all text-left group"
                        >
                            <div className="bg-blue-50 w-10 h-10 rounded-full flex items-center justify-center text-blue-600 mb-3 group-hover:scale-110 transition-transform">
                                <Play size={20} fill="currentColor" />
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resume</p>
                            <p className="font-bold text-slate-800 leading-tight">Continue Learning</p>
                        </button>

                        <button 
                            onClick={() => startAutoChallenge('DAILY')}
                            className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-sm hover:shadow-md transition-all text-left group relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full blur-xl -mr-4 -mt-4"></div>
                            <div className="bg-yellow-500/20 w-10 h-10 rounded-full flex items-center justify-center text-yellow-400 mb-3 group-hover:scale-110 transition-transform relative z-10">
                                <Zap size={20} fill="currentColor" />
                            </div>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest relative z-10">Daily</p>
                            <p className="font-bold text-white leading-tight relative z-10">Start Challenge</p>
                        </button>
                    </div>
                </div>

                {/* 🥈 LAYER 2 - SMART SLIDE (Scrollable) */}
                <div className="pt-4 pb-8 space-y-6">
                    <div className="flex items-center justify-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-widest animate-bounce">
                        <ChevronUp size={16} /> Explore More
                    </div>

                    {/* AI TOUR (GLOWING) */}
                    <button 
                        onClick={() => setShowUserGuide(true)}
                        className="w-full bg-gradient-to-r from-pink-500 to-rose-500 p-4 rounded-2xl shadow-lg shadow-pink-200 text-white font-bold flex items-center justify-center gap-3 animate-pulse hover:scale-[1.02] transition-transform"
                    >
                        <BrainCircuit size={20} /> Take AI Tour
                    </button>

                    <BannerCarousel>
                        {/* EXISTING BANNERS ... */}
                        <div className="mx-1 h-48 bg-gradient-to-r from-blue-600 to-cyan-500 p-6 rounded-2xl shadow-lg text-white relative overflow-hidden flex flex-col justify-center">
                            <h3 className="text-2xl font-black mb-2 relative z-10">Premium Content</h3>
                            <p className="text-blue-100 mb-4 relative z-10">Unlock all features today.</p>
                            <button onClick={() => onTabChange('STORE')} className="bg-white text-blue-600 px-6 py-2 rounded-xl font-bold w-fit relative z-10">Go to Store</button>
                        </div>
                    </BannerCarousel>

                    {/* FEATURES TICKER */}
                    <div className="overflow-hidden py-3 bg-slate-100 rounded-xl">
                        <div className="flex gap-8 animate-marquee whitespace-nowrap">
                            {ALL_APP_FEATURES.map((feat, i) => (
                                <span key={feat.id} className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                    {feat.title}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* 🥉 LAYER 3 - POWER USER ZONE (Now integrated as lower grid) */}
                <DashboardSectionWrapper id="power_user_zone" label="Power Zone">
                    <div className="grid grid-cols-3 gap-3">
                        <button onClick={() => onTabChange('HISTORY')} className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col items-center gap-2 hover:bg-slate-50">
                            <History size={20} className="text-slate-500" />
                            <span className="text-[10px] font-bold text-slate-600">History</span>
                        </button>
                        <button onClick={() => onTabChange('ANALYTICS')} className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col items-center gap-2 hover:bg-slate-50">
                            <BarChart3 size={20} className="text-slate-500" />
                            <span className="text-[10px] font-bold text-slate-600">Analytics</span>
                        </button>
                        <button onClick={() => setShowMonthlyReport(true)} className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col items-center gap-2 hover:bg-slate-50">
                            <FileText size={20} className="text-slate-500" />
                            <span className="text-[10px] font-bold text-slate-600">Marksheet</span>
                        </button>
                        {isGameEnabled && (
                            <button onClick={() => onTabChange('GAME')} className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col items-center gap-2 hover:bg-slate-50">
                                <Gamepad2 size={20} className="text-slate-500" />
                                <span className="text-[10px] font-bold text-slate-600">Game</span>
                            </button>
                        )}
                        <button onClick={() => onTabChange('PRIZES')} className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col items-center gap-2 hover:bg-slate-50">
                            <Award size={20} className="text-slate-500" />
                            <span className="text-[10px] font-bold text-slate-600">Prizes</span>
                        </button>
                        <button onClick={() => onTabChange('LEADERBOARD')} className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col items-center gap-2 hover:bg-slate-50">
                            <Trophy size={20} className="text-slate-500" />
                            <span className="text-[10px] font-bold text-slate-600">Ranks</span>
                        </button>
                    </div>
                </DashboardSectionWrapper>

              </div>
          );
      }

      // 2. COURSES TAB
      if (activeTab === 'COURSES') {
          const visibleSubjects = getSubjectsList(user.classLevel || '10', user.stream || null)
                                    .filter(s => !(settings?.hiddenSubjects || []).includes(s.id));

          return (
              <div className="space-y-6 pb-24">
                      <div className="flex items-center justify-between">
                          <h2 className="text-2xl font-black text-slate-800">My Study Hub</h2>
                      </div>
                      
                      {settings?.contentVisibility?.VIDEO !== false && (
                          <div className="bg-red-50 p-4 rounded-2xl border border-red-100">
                              <h3 className="font-bold text-red-800 flex items-center gap-2 mb-2"><Youtube /> Video Lectures</h3>
                              <div className="grid grid-cols-2 gap-2">
                                  {visibleSubjects.map(s => (
                                      <button key={s.id} onClick={() => { onTabChange('VIDEO'); handleContentSubjectSelect(s); }} className="bg-white p-2 rounded-xl text-xs font-bold text-slate-700 shadow-sm border border-red-100 text-left">
                                          {s.name}
                                      </button>
                                  ))}
                              </div>
                          </div>
                      )}

                      {settings?.contentVisibility?.PDF !== false && (
                          <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                              <h3 className="font-bold text-blue-800 flex items-center gap-2 mb-2"><FileText /> Notes Library</h3>
                              <div className="grid grid-cols-2 gap-2">
                                  {visibleSubjects.map(s => (
                                      <button key={s.id} onClick={() => { onTabChange('PDF'); handleContentSubjectSelect(s); }} className="bg-white p-2 rounded-xl text-xs font-bold text-slate-700 shadow-sm border border-blue-100 text-left">
                                          {s.name}
                                      </button>
                                  ))}
                              </div>
                          </div>
                      )}

                      {settings?.contentVisibility?.MCQ !== false && (
                          <div className="bg-purple-50 p-4 rounded-2xl border border-purple-100">
                              <div className="flex justify-between items-center mb-2">
                                  <h3 className="font-bold text-purple-800 flex items-center gap-2"><CheckSquare /> MCQ Practice</h3>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                  {visibleSubjects.map(s => (
                                      <button key={s.id} onClick={() => { onTabChange('MCQ'); handleContentSubjectSelect(s); }} className="bg-white p-2 rounded-xl text-xs font-bold text-slate-700 shadow-sm border border-purple-100 text-left">
                                          {s.name}
                                      </button>
                                  ))}
                              </div>
                          </div>
                      )}

                      {settings?.contentVisibility?.AUDIO !== false && (
                          <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-4 rounded-2xl shadow-lg border border-slate-700 relative overflow-hidden">
                              <div className="flex justify-between items-center mb-2 relative z-10">
                                  <h3 className="font-bold text-white flex items-center gap-2"><Headphones className="text-pink-500" /> Audio Library</h3>
                                  <span className="text-[10px] font-black bg-pink-600 text-white px-2 py-0.5 rounded-full">NEW</span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 relative z-10">
                                  {visibleSubjects.map(s => (
                                      <button key={s.id} onClick={() => { onTabChange('AUDIO'); handleContentSubjectSelect(s); }} className="bg-white/10 hover:bg-white/20 p-2 rounded-xl text-xs font-bold text-white shadow-sm border border-white/10 text-left backdrop-blur-sm transition-colors">
                                          {s.name}
                                      </button>
                                  ))}
                              </div>
                          </div>
                      )}
                  </div>
              );
      }

      // 4. LEGACY TABS
      if (activeTab === 'CUSTOM_PAGE') return <CustomBloggerPage onBack={() => onTabChange('HOME')} />;
      if (activeTab === 'DEEP_ANALYSIS') return <AiDeepAnalysis user={user} settings={settings} onUpdateUser={handleUserUpdate} onBack={() => onTabChange('HOME')} />;
      if (activeTab === 'AI_HISTORY') return <AiHistoryPage user={user} onBack={() => onTabChange('HOME')} />;
      if (activeTab === 'UPDATES') return <UniversalInfoPage onBack={() => onTabChange('HOME')} />;
      if ((activeTab as string) === 'ANALYTICS') return <AnalyticsPage user={user} onBack={() => onTabChange('HOME')} settings={settings} onNavigateToChapter={onNavigateToChapter} />;
      if ((activeTab as string) === 'SUB_HISTORY') return <SubscriptionHistory user={user} onBack={() => onTabChange('HOME')} />;
      if (activeTab === 'HISTORY') return <HistoryPage user={user} onUpdateUser={handleUserUpdate} settings={settings} />;
      if (activeTab === 'LEADERBOARD') return <Leaderboard user={user} settings={settings} />;
      if (activeTab === 'GAME') return isGameEnabled ? (user.isGameBanned ? <div className="text-center py-20 bg-red-50 rounded-2xl border border-red-100"><Ban size={48} className="mx-auto text-red-500 mb-4" /><h3 className="text-lg font-bold text-red-700">Access Denied</h3><p className="text-sm text-red-600">Admin has disabled the game for your account.</p></div> : <SpinWheel user={user} onUpdateUser={handleUserUpdate} settings={settings} />) : null;
      if (activeTab === 'REDEEM') return <div className="animate-in fade-in slide-in-from-bottom-2 duration-300"><RedeemSection user={user} onSuccess={onRedeemSuccess} /></div>;
      if (activeTab === 'PRIZES') return <div className="animate-in fade-in slide-in-from-bottom-2 duration-300"><PrizeList /></div>;
      if (activeTab === 'STORE') return <Store user={user} settings={settings} onUserUpdate={handleUserUpdate} />;
      
      // PROFILE TAB (With Voice Settings)
      if (activeTab === 'PROFILE') return (
                <div className="animate-in fade-in zoom-in duration-300 pb-24">
                    <div className={`rounded-3xl p-8 text-center text-white mb-6 shadow-xl relative overflow-hidden transition-all duration-500 ${
                        user.subscriptionLevel === 'ULTRA' && user.isPremium 
                        ? 'bg-gradient-to-br from-slate-900 via-purple-900 to-indigo-900 shadow-purple-500/50 ring-2 ring-purple-400/50' 
                        : user.subscriptionLevel === 'BASIC' && user.isPremium
                        ? 'bg-gradient-to-br from-blue-600 via-indigo-600 to-cyan-600 shadow-blue-500/50'
                        : 'bg-gradient-to-br from-slate-700 to-slate-900'
                    }`}>
                        <div className={`w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-4 text-4xl font-black shadow-2xl relative z-10 ${
                            user.subscriptionLevel === 'ULTRA' && user.isPremium ? 'text-purple-700 ring-4 ring-purple-300 animate-bounce-slow' : 
                            user.subscriptionLevel === 'BASIC' && user.isPremium ? 'text-blue-600 ring-4 ring-cyan-300' : 
                            'text-slate-800'
                        }`}>
                            {user.name.charAt(0)}
                        </div>
                        
                        <h2 className="text-3xl font-black relative z-10">{user.name}</h2>
                        <p className="text-white/80 text-sm font-mono relative z-10">ID: {user.displayId || user.id}</p>
                        
                        <div className="mt-4 relative z-10">
                            <span className={`px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest shadow-lg ${
                                user.subscriptionLevel === 'ULTRA' && user.isPremium ? 'bg-purple-500 text-white border border-purple-300' : 
                                user.subscriptionLevel === 'BASIC' && user.isPremium ? 'bg-cyan-500 text-white' : 'bg-slate-600 text-slate-300'
                            }`}>
                                {user.isPremium ? `✨ ${user.subscriptionLevel} MEMBER ✨` : 'Free User'}
                            </span>
                        </div>
                    </div>
                    
                    <div className="space-y-4">
                        {/* VOICE SETTINGS (NEW) */}
                        <div className="bg-white rounded-xl p-4 border border-slate-200">
                            <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                                <Headphones size={16} /> Audio Settings
                            </h4>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-slate-500">Audio Guide</span>
                                <button 
                                    onClick={() => {
                                        const newState = !isAudioEnabled();
                                        toggleAudio(newState);
                                        showAlert(newState ? "Audio Enabled" : "Audio Disabled", "INFO");
                                        // Force refresh to update UI state if needed
                                        setCanClaimReward(prev => prev); 
                                    }}
                                    className={`px-3 py-1 rounded-full text-xs font-bold ${isAudioEnabled() ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                                >
                                    {isAudioEnabled() ? 'ON' : 'OFF'}
                                </button>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-500">Voice (Indian)</span>
                                <select 
                                    className="text-xs border rounded p-1 max-w-[150px]"
                                    onChange={(e) => setPreferredVoice(e.target.value)}
                                    defaultValue={localStorage.getItem('nst_preferred_voice_uri') || ''}
                                >
                                    {availableVoices.length === 0 && <option value="">Default</option>}
                                    {availableVoices.map(v => (
                                        <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-slate-100 rounded-xl">
                            <div className="flex items-center gap-2">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDarkMode ? 'bg-slate-800 text-yellow-400' : 'bg-white text-slate-600'}`}>
                                    {isDarkMode ? <Sparkles size={16} /> : <Zap size={16} />}
                                </div>
                                <span className="font-bold text-slate-700 text-sm">Dark Mode</span>
                            </div>
                            <button 
                                onClick={() => onToggleDarkMode && onToggleDarkMode(!isDarkMode)}
                                className={`w-12 h-7 rounded-full transition-all relative ${isDarkMode ? 'bg-slate-800' : 'bg-slate-300'}`}
                            >
                                <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-sm ${isDarkMode ? 'left-6' : 'left-1'}`} />
                            </button>
                        </div>

                        <button onClick={() => setEditMode(true)} className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-900">✏️ Edit Profile</button>
                        <button onClick={() => {storage.removeItem('nst_current_user'); window.location.reload();}} className="w-full bg-red-500 text-white py-3 rounded-xl font-bold hover:bg-red-600">🚪 Logout</button>
                    </div>
                </div>
      );

      if (activeTab === 'VIDEO' || activeTab === 'PDF' || activeTab === 'MCQ' || activeTab === 'AUDIO') {
          return renderContentSection(activeTab);
      }

      return null;
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
        {(user.role === 'ADMIN' || isImpersonating) && (
             <div className="fixed bottom-36 right-4 z-50 flex flex-col gap-3 items-end">
                 <button 
                    onClick={() => setIsLayoutEditing(!isLayoutEditing)}
                    className={`p-4 rounded-full shadow-2xl border-2 hover:scale-110 transition-transform flex items-center gap-2 ${isLayoutEditing ? 'bg-yellow-400 text-black border-yellow-500' : 'bg-white text-slate-800 border-slate-200'}`}
                 >
                     <Edit size={20} />
                     {isLayoutEditing && <span className="font-bold text-xs">Editing Layout</span>}
                 </button>
                 <button 
                    onClick={handleSwitchToAdmin}
                    className="bg-slate-900 text-white p-4 rounded-full shadow-2xl border-2 border-slate-700 hover:scale-110 transition-transform flex items-center gap-2 animate-bounce-slow"
                 >
                     <Layout size={20} className="text-yellow-400" />
                     <span className="font-bold text-xs">Admin Panel</span>
                 </button>
             </div>
        )}

        {/* AI NOTES MODAL */}
        {showAiModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in">
                <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                                <BrainCircuit size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-slate-800">{settings?.aiName || 'AI Notes'}</h3>
                                <p className="text-xs text-slate-500">Instant Note Generator</p>
                            </div>
                        </div>
                        <button onClick={() => {setShowAiModal(false); setAiResult(null);}} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
                    </div>

                    {!aiResult ? (
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase block mb-2">What topic do you want notes for?</label>
                                <textarea 
                                    value={aiTopic}
                                    onChange={(e) => setAiTopic(e.target.value)}
                                    placeholder="e.g. Newton's Laws of Motion, Photosynthesis process..."
                                    className="w-full p-4 bg-slate-50 border-none rounded-2xl text-slate-800 focus:ring-2 focus:ring-indigo-100 h-32 resize-none"
                                />
                            </div>
                            <button 
                                onClick={handleAiNotesGeneration}
                                disabled={aiGenerating}
                                className="w-full py-4 bg-indigo-600 text-white font-black rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                {aiGenerating ? <Sparkles className="animate-spin" /> : <Sparkles />}
                                {aiGenerating ? "Generating Magic..." : "Generate Notes"}
                            </button>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-hidden flex flex-col">
                            <div className="flex-1 overflow-y-auto bg-slate-50 p-4 rounded-xl border border-slate-100 mb-4 prose prose-sm max-w-none">
                                <div className="whitespace-pre-wrap">{aiResult}</div>
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => setAiResult(null)}
                                    className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl"
                                >
                                    New Topic
                                </button>
                                <button 
                                    onClick={() => {
                                        navigator.clipboard.writeText(aiResult);
                                        showAlert("Notes Copied!", "SUCCESS");
                                    }}
                                    className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg"
                                >
                                    Copy Text
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* REQUEST CONTENT MODAL */}
        {showRequestModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
                    <div className="flex items-center gap-2 mb-4 text-pink-600">
                        <Megaphone size={24} />
                        <h3 className="text-lg font-black text-slate-800">Request Content</h3>
                    </div>
                    
                    <div className="space-y-3 mb-6">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Subject</label>
                            <input type="text" value={requestData.subject} onChange={e => setRequestData({...requestData, subject: e.target.value})} className="w-full p-2 border rounded-lg" placeholder="e.g. Mathematics" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Topic / Chapter</label>
                            <input type="text" value={requestData.topic} onChange={e => setRequestData({...requestData, topic: e.target.value})} className="w-full p-2 border rounded-lg" placeholder="e.g. Trigonometry" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Type</label>
                            <select value={requestData.type} onChange={e => setRequestData({...requestData, type: e.target.value})} className="w-full p-2 border rounded-lg">
                                <option value="PDF">PDF Notes</option>
                                <option value="VIDEO">Video Lecture</option>
                                <option value="MCQ">MCQ Test</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button onClick={() => setShowRequestModal(false)} className="flex-1 py-3 text-slate-500 font-bold bg-slate-100 rounded-xl">Cancel</button>
                        <button 
                            onClick={async () => {
                                if (!requestData.subject || !requestData.topic) { showAlert("Please fill all fields", 'ERROR'); return; }
                                const request = {
                                    id: `req-${Date.now()}`,
                                    userId: user.id,
                                    userName: user.name,
                                    details: `${user.classLevel || '10'} ${user.board || 'CBSE'} - ${requestData.subject} - ${requestData.topic} - ${requestData.type}`,
                                    timestamp: new Date().toISOString()
                                };
                                const existing = await storage.getItem<any[]>('nst_demand_requests') || [];
                                existing.push(request);
                                storage.setItem('nst_demand_requests', existing);
                                setShowRequestModal(false);
                                showAlert("✅ Request Sent! Admin will check it.", 'SUCCESS');
                            }}
                            className="flex-1 py-3 bg-pink-600 text-white font-bold rounded-xl hover:bg-pink-700 shadow-lg"
                        >
                            Send Request
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* NAME CHANGE MODAL */}
        {showNameChangeModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
                    <h3 className="text-lg font-bold mb-4 text-slate-800">Change Display Name</h3>
                    <input type="text" value={newNameInput} onChange={e => setNewNameInput(e.target.value)} className="w-full p-3 border rounded-xl mb-2" placeholder="Enter new name" />
                    <p className="text-xs text-slate-500 mb-4">Cost: <span className="font-bold text-orange-600">{settings?.nameChangeCost || 10} Coins</span></p>
                    <div className="flex gap-2">
                        <button onClick={() => setShowNameChangeModal(false)} className="flex-1 py-2 text-slate-500 font-bold bg-slate-100 rounded-lg">Cancel</button>
                        <button 
                            onClick={() => {
                                const cost = settings?.nameChangeCost || 10;
                                if (newNameInput && newNameInput !== user.name) {
                                    if (user.credits < cost) { showAlert(`Insufficient Coins! Need ${cost}.`, 'ERROR'); return; }
                                    const u = { ...user, name: newNameInput, credits: user.credits - cost };
                                    handleUserUpdate(u);
                                    setShowNameChangeModal(false);
                                    showAlert("Name Updated Successfully!", 'SUCCESS');
                                }
                            }}
                            className="flex-1 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700"
                        >
                            Pay & Update
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* MAIN CONTENT AREA */}
        <div className="p-4">
            {renderMainContent()}
            
            {settings?.showFooter !== false && (
                <div className="mt-8 mb-4 text-center">
                    <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: settings?.footerColor || '#cbd5e1' }}>
                        Developed by Nadim Anwar
                    </p>
                </div>
            )}
        </div>

        {/* MINI PLAYER */}
        <MiniPlayer track={currentAudioTrack} onClose={() => setCurrentAudioTrack(null)} />

        {/* FIXED BOTTOM NAVIGATION */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg z-50 pb-safe">
            <div className="flex justify-around items-center h-16">
                <button onClick={() => { playAudioGuide('BTN_HOME', 'Dashboard Home'); onTabChange('HOME'); setContentViewStep('SUBJECTS'); }} className={`flex flex-col items-center justify-center w-full h-full ${activeTab === 'HOME' ? 'text-blue-600' : 'text-slate-400'}`}>
                    <Home size={24} fill={activeTab === 'HOME' ? "currentColor" : "none"} />
                    <span className="text-[10px] font-bold mt-1">Home</span>
                </button>
                
                <button onClick={() => {
                        playAudioGuide('BTN_VIDEOS', 'Universal Videos');
                        setSelectedSubject({ id: 'universal', name: 'Special' } as any);
                        setSelectedChapter({ id: 'UNIVERSAL', title: 'Featured Lectures' } as any);
                        setContentViewStep('PLAYER');
                        setFullScreen(true);
                        onTabChange('VIDEO');
                        storage.setItem('nst_last_read_update', Date.now().toString());
                        setHasNewUpdate(false);
                    }} 
                    className={`flex flex-col items-center justify-center w-full h-full ${activeTab === 'VIDEO' && selectedChapter?.id === 'UNIVERSAL' ? 'text-blue-600' : 'text-slate-400'}`}
                >
                    <div className="relative">
                         <Play size={24} fill={activeTab === 'VIDEO' && selectedChapter?.id === 'UNIVERSAL' ? "currentColor" : "none"} />
                         {hasNewUpdate && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-600 rounded-full border border-white animate-pulse"></span>}
                    </div>
                    <span className="text-[10px] font-bold mt-1">Videos</span>
                </button>

                <button onClick={() => { playAudioGuide('BTN_COURSES', 'Explore Courses'); onTabChange('COURSES'); setContentViewStep('SUBJECTS'); }} className={`flex flex-col items-center justify-center w-full h-full ${activeTab === 'COURSES' || (activeTab === 'VIDEO' && selectedChapter?.id !== 'UNIVERSAL') || activeTab === 'PDF' || activeTab === 'MCQ' || activeTab === 'AUDIO' ? 'text-blue-600' : 'text-slate-400'}`}>
                    <Book size={24} fill={activeTab === 'COURSES' || (activeTab === 'VIDEO' && selectedChapter?.id !== 'UNIVERSAL') || activeTab === 'PDF' || activeTab === 'MCQ' || activeTab === 'AUDIO' ? "currentColor" : "none"} />
                    <span className="text-[10px] font-bold mt-1">Courses</span>
                </button>
                
                <button onClick={() => { playAudioGuide('BTN_STORE', 'Premium Store'); onTabChange('STORE'); setContentViewStep('SUBJECTS'); }} className={`flex flex-col items-center justify-center w-full h-full ${activeTab === 'STORE' ? 'text-blue-600' : 'text-slate-400'}`}>
                    <ShoppingBag size={24} fill={activeTab === 'STORE' ? "currentColor" : "none"} />
                    <span className="text-[10px] font-bold mt-1">Store</span>
                </button>

                <button onClick={() => { playAudioGuide('BTN_PROFILE', 'User Profile'); onTabChange('PROFILE'); }} className={`flex flex-col items-center justify-center w-full h-full ${activeTab === 'PROFILE' ? 'text-blue-600' : 'text-slate-400'}`}>
                    <UserIcon size={24} fill={activeTab === 'PROFILE' ? "currentColor" : "none"} />
                    <span className="text-[10px] font-bold mt-1">Profile</span>
                </button>
            </div>
        </div>

        {/* SYLLABUS SELECTION POPUP */}
        {showSyllabusPopup && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
                <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl scale-in-center">
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600">
                            <BookOpen size={32} />
                        </div>
                        <h3 className="text-xl font-black text-slate-800">Choose Syllabus Mode</h3>
                        <p className="text-sm text-slate-500 mt-1">Select how you want to study this chapter.</p>
                    </div>
                    
                    <div className="space-y-3 mb-6">
                        <button 
                            onClick={() => confirmSyllabusSelection('SCHOOL')}
                            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-blue-200 active:scale-95 transition-all flex items-center justify-center gap-3"
                        >
                            🏫 School Mode
                        </button>
                        <button 
                            onClick={() => confirmSyllabusSelection('COMPETITION')}
                            className="w-full bg-purple-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-purple-200 active:scale-95 transition-all flex items-center justify-center gap-3"
                        >
                            🏆 Competition Mode
                        </button>
                    </div>

                    <button 
                        onClick={() => setShowSyllabusPopup(null)}
                        className="w-full py-3 text-slate-400 font-bold hover:text-slate-600 transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        )}

        {/* MODALS */}
        {showUserGuide && <UserGuide onClose={() => setShowUserGuide(false)} />}
        
        {editMode && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
                    <h3 className="font-bold text-lg mb-4">Edit Profile & Settings</h3>
                    <div className="space-y-3 mb-6">
                        <div><label className="text-xs font-bold text-slate-500 uppercase">Daily Study Goal (Hours)</label><input type="number" value={profileData.dailyGoalHours} onChange={e => setProfileData({...profileData, dailyGoalHours: Number(e.target.value)})} className="w-full p-2 border rounded-lg" min={1} max={12}/></div>
                        <div className="h-px bg-slate-100 my-2"></div>
                        <div><label className="text-xs font-bold text-slate-500 uppercase">New Password</label><input type="text" placeholder="Set new password (optional)" value={profileData.newPassword} onChange={e => setProfileData({...profileData, newPassword: e.target.value})} className="w-full p-2 border rounded-lg bg-yellow-50 border-yellow-200"/><p className="text-[9px] text-slate-400 mt-1">Leave blank to keep current password.</p></div>
                        <div className="h-px bg-slate-100 my-2"></div>
                        <div><label className="text-xs font-bold text-slate-500 uppercase">Board</label><select value={profileData.board} onChange={e => setProfileData({...profileData, board: e.target.value as any})} className="w-full p-2 border rounded-lg"><option value="CBSE">CBSE</option><option value="BSEB">BSEB</option></select></div>
                        <div><label className="text-xs font-bold text-slate-500 uppercase">Class</label><select value={profileData.classLevel} onChange={e => setProfileData({...profileData, classLevel: e.target.value as any})} className="w-full p-2 border rounded-lg">{['6','7','8','9','10','11','12'].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                        {['11','12'].includes(profileData.classLevel) && (<div><label className="text-xs font-bold text-slate-500 uppercase">Stream</label><select value={profileData.stream} onChange={e => setProfileData({...profileData, stream: e.target.value as any})} className="w-full p-2 border rounded-lg"><option value="Science">Science</option><option value="Commerce">Commerce</option><option value="Arts">Arts</option></select></div>)}
                    </div>
                    <div className="flex gap-2"><button onClick={() => setEditMode(false)} className="flex-1 py-2 text-slate-500 font-bold">Cancel</button><button onClick={saveProfile} className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-bold">Save Changes</button></div>
                </div>
            </div>
        )}
        
        {showInbox && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
                    <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2"><Mail size={18} className="text-blue-600" /> Admin Messages</h3>
                        <button onClick={() => setShowInbox(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                    </div>
                    <div className="max-h-80 overflow-y-auto p-4 space-y-3">
                        {(!user.inbox || user.inbox.length === 0) && <p className="text-slate-400 text-sm text-center py-8">No messages.</p>}
                        {user.inbox?.map(msg => (
                            <div key={msg.id} className={`p-3 rounded-xl border text-sm ${msg.read ? 'bg-white border-slate-100' : 'bg-blue-50 border-blue-100'} transition-all`}>
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        <p className="font-bold text-slate-500">{msg.type === 'GIFT' ? '🎁 GIFT' : 'MESSAGE'}</p>
                                        {!msg.read && <span className="w-2 h-2 bg-blue-500 rounded-full"></span>}
                                    </div>
                                    <p className="text-slate-400 text-[10px]">{new Date(msg.date).toLocaleDateString()}</p>
                                </div>
                                <p className="text-slate-700 leading-relaxed mb-2">{msg.text}</p>
                            </div>
                        ))}
                    </div>
                    {unreadCount > 0 && <button onClick={markInboxRead} className="w-full py-3 bg-blue-600 text-white font-bold text-sm hover:opacity-90">Mark All as Read</button>}
                </div>
            </div>
        )}

        {showSupportModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl text-center">
                    <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Headphones size={32} className="text-blue-600" />
                    </div>
                    <h3 className="text-xl font-black text-slate-800 mb-2">Need Help?</h3>
                    <p className="text-sm text-slate-500 mb-6">
                        Contact Admin directly for support, subscription issues, or questions.
                    </p>
                    
                    <button 
                        onClick={handleSupportEmail}
                        className="w-full bg-green-500 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-green-600 transition-all flex items-center justify-center gap-2 mb-3"
                    >
                        <Mail size={20} /> Email Support
                    </button>
                    
                    <button 
                        onClick={() => setShowSupportModal(false)} 
                        className="w-full py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl"
                    >
                        Close
                    </button>
                </div>
            </div>
        )}

        {isLoadingContent && <LoadingOverlay dataReady={isDataReady} onComplete={onLoadingComplete} />}
        {activeExternalApp && <div className="fixed inset-0 z-50 bg-white flex flex-col"><div className="flex items-center justify-between p-4 border-b bg-slate-50"><button onClick={() => setActiveExternalApp(null)} className="p-2 bg-white rounded-full border shadow-sm"><X size={20} /></button><p className="font-bold text-slate-700">External App</p><div className="w-10"></div></div><iframe src={activeExternalApp} className="flex-1 w-full border-none" title="External App" allow="camera; microphone; geolocation; payment" /></div>}
        {pendingApp && <CreditConfirmationModal title={`Access ${pendingApp.app.name}`} cost={pendingApp.cost} userCredits={user.credits} isAutoEnabledInitial={!!user.isAutoDeductEnabled} onCancel={() => setPendingApp(null)} onConfirm={(auto) => processAppAccess(pendingApp.app, pendingApp.cost, auto)} />}
        
        <CustomAlert 
            isOpen={alertConfig.isOpen}
            type={alertConfig.type}
            title={alertConfig.title}
            message={alertConfig.message}
            onClose={() => setAlertConfig(prev => ({...prev, isOpen: false}))}
        />

        {showChat && <UniversalChat user={user} onClose={() => setShowChat(false)} />}

        <ExpiryPopup 
            isOpen={showExpiryPopup}
            onClose={() => setShowExpiryPopup(false)}
            expiryDate={user.subscriptionEndDate || new Date().toISOString()}
            onRenew={() => {
                setShowExpiryPopup(false);
                onTabChange('STORE');
            }}
        />

        {showMonthlyReport && <MonthlyMarksheet user={user} settings={settings} onClose={() => setShowMonthlyReport(false)} />}
        {showReferralPopup && <ReferralPopup user={user} onClose={() => setShowReferralPopup(false)} onUpdateUser={handleUserUpdate} />}

        <StudentAiAssistant 
            user={user} 
            settings={settings} 
            isOpen={activeTab === 'AI_CHAT'} 
            onClose={() => onTabChange('HOME')} 
        />
    </div>
  );
};


import React, { useState, useEffect } from 'react';
import { Timer, Play, Pause, ChevronDown, CheckCircle } from 'lucide-react';

interface Props {
    dailyStudySeconds: number;
    goalSeconds: number;
    onSetGoal: (seconds: number) => void;
}

export const StudyTimer: React.FC<Props> = ({ dailyStudySeconds, goalSeconds, onSetGoal }) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    
    const progress = Math.min((dailyStudySeconds / (goalSeconds || 1)) * 100, 100);
    const timeLeft = Math.max(goalSeconds - dailyStudySeconds, 0);
    
    const formatTime = (secs: number) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        return `${h}h ${m}m`;
    };

    const options = [
        { label: '30 min', value: 1800 },
        { label: '1 hr', value: 3600 },
        { label: '2 hr', value: 7200 },
        { label: '3 hr', value: 10800 },
    ];

    return (
        <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl border border-slate-800 relative overflow-hidden mb-4">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl -mr-10 -mt-10 animate-pulse"></div>
            
            <div className="flex justify-between items-start relative z-10 mb-4">
                <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                        <Timer size={12} /> Today's Focus
                    </p>
                    <div className="flex items-end gap-2 mt-1">
                        <h2 className="text-3xl font-black font-mono leading-none">
                            {formatTime(dailyStudySeconds)}
                        </h2>
                        <span className="text-xs text-slate-500 font-bold mb-1">/ {formatTime(goalSeconds)}</span>
                    </div>
                </div>
                
                <div className="relative">
                    <button 
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-full text-xs font-bold border border-slate-700 transition-colors"
                    >
                        Set Goal <ChevronDown size={12} />
                    </button>
                    {isMenuOpen && (
                        <div className="absolute right-0 top-full mt-2 w-32 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-50">
                            {options.map(opt => (
                                <button 
                                    key={opt.value}
                                    onClick={() => { onSetGoal(opt.value); setIsMenuOpen(false); }}
                                    className="w-full text-left px-4 py-2 text-xs font-bold hover:bg-slate-700 flex justify-between items-center"
                                >
                                    {opt.label}
                                    {goalSeconds === opt.value && <CheckCircle size={12} className="text-green-400" />}
                                </button>
                            ))}
                            <button 
                                onClick={() => { 
                                    const custom = prompt("Enter minutes:"); 
                                    if(custom) onSetGoal(Number(custom)*60); 
                                    setIsMenuOpen(false); 
                                }}
                                className="w-full text-left px-4 py-2 text-xs font-bold hover:bg-slate-700 text-blue-400"
                            >
                                Custom...
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* PROGRESS BAR */}
            <div className="h-4 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700/50 relative">
                <div 
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-1000 relative"
                    style={{ width: `${progress}%` }}
                >
                    <div className="absolute inset-0 bg-white/20 animate-shimmer"></div>
                </div>
            </div>
            
            <p className="text-[10px] text-slate-400 mt-2 text-right">
                {progress >= 100 ? "Goal Achieved! 🎯" : `${Math.round(progress)}% Completed`}
            </p>
        </div>
    );
};

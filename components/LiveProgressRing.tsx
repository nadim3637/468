
import React from 'react';
import { Activity, Flame, Calendar } from 'lucide-react';

interface Props {
    dailySeconds: number;
    weeklySeconds: number;
    streak: number;
}

export const LiveProgressRing: React.FC<Props> = ({ dailySeconds, weeklySeconds, streak }) => {
    // Helper for circular progress
    const CircleProgress = ({ value, max, color, size = 60, icon: Icon, label }: any) => {
        const radius = size / 2 - 4;
        const circumference = 2 * Math.PI * radius;
        const progress = Math.min((value / max) * 100, 100);
        const offset = circumference - (progress / 100) * circumference;

        return (
            <div className="flex flex-col items-center gap-1">
                <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
                    {/* Background Circle */}
                    <svg className="absolute inset-0 transform -rotate-90" width={size} height={size}>
                        <circle
                            cx={size / 2}
                            cy={size / 2}
                            r={radius}
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="transparent"
                            className="text-slate-100"
                        />
                        <circle
                            cx={size / 2}
                            cy={size / 2}
                            r={radius}
                            stroke={color}
                            strokeWidth="4"
                            fill="transparent"
                            strokeDasharray={circumference}
                            strokeDashoffset={offset}
                            strokeLinecap="round"
                            className="transition-all duration-1000 ease-out"
                        />
                    </svg>
                    {/* Icon Center */}
                    <div className={`text-${color.replace('text-', '')}`} style={{ color: color }}>
                        <Icon size={18} />
                    </div>
                </div>
                <div className="text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                    <p className="text-xs font-black text-slate-800">
                        {label === 'Streak' ? `${value} Days` : `${Math.floor(value / 3600)}h ${Math.floor((value % 3600) / 60)}m`}
                    </p>
                </div>
            </div>
        );
    };

    return (
        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex justify-around items-center mb-4">
            <CircleProgress 
                value={dailySeconds} 
                max={10800} // 3 Hours Target 
                color="#3b82f6" // Blue
                icon={Activity} 
                label="Today" 
            />
            <div className="w-px h-12 bg-slate-100"></div>
            <CircleProgress 
                value={weeklySeconds} 
                max={64800} // 18 Hours Target
                color="#8b5cf6" // Purple
                icon={Calendar} 
                label="Week" 
            />
            <div className="w-px h-12 bg-slate-100"></div>
            <CircleProgress 
                value={streak} 
                max={30} // 30 Days Target
                color="#f59e0b" // Orange
                icon={Flame} 
                label="Streak" 
            />
        </div>
    );
};

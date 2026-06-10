import { useState } from 'react';
import { UserProfile } from '../types';
import { User, Mail, FileText, ArrowLeft, Check } from 'lucide-react';

export function Profile({ user, onSave, onCancel, onLogout, isDarkMode }: { user: UserProfile, onSave: (u: UserProfile) => void, onCancel: () => void, onLogout: () => void, isDarkMode: boolean }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [bio, setBio] = useState(user.bio || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ ...user, name, email, bio });
  };

  return (
    <div className={`min-h-screen w-full flex flex-col items-center justify-center p-4 transition-colors ${isDarkMode ? 'dark bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <div className="w-full max-w-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden transition-colors">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-2 text-sm font-medium transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </button>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">Edit Profile</h2>
        </div>
        
        <div className="p-8">
          <div className="flex items-center gap-6 mb-8">
            <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900/50 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-3xl border-4 border-white dark:border-slate-800 shadow-sm transition-colors">
              {name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="text-xl font-bold dark:text-white">{name}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Student Account</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                <User className="w-3.5 h-3.5" /> Full Name
              </label>
              <input
                required
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm dark:text-white transition-colors"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                <Mail className="w-3.5 h-3.5" /> Email Address
              </label>
              <input
                required
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm dark:text-white transition-colors"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                <FileText className="w-3.5 h-3.5" /> Academic Bio / Goals
              </label>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                rows={3}
                placeholder="What are you focusing on?"
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm dark:text-white transition-colors resize-none"
              />
            </div>
            
            <div className="pt-4 flex justify-between">
              <button
                type="button"
                onClick={onLogout}
                className="flex items-center gap-2 px-6 py-2.5 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 rounded-lg text-sm font-bold shadow-sm transition-colors"
              >
                Log Out
              </button>
              <button
                type="submit"
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-md transition-colors"
              >
                <Check className="w-4 h-4" /> Save Profile
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

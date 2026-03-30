import React, { useState, useEffect } from 'react';
import { Plus, Bell, Calendar, FileText, X, Check, Settings, Clock, Repeat, Edit2, Trash2, RotateCcw, Copy } from 'lucide-react';

interface TangoEvent {
  id: string;
  name: string;
  date?: string;
  recurringDay?: string;
  time?: string;
  doneBefore: boolean;
  notes?: string;
  isPublishedOnMeetup: boolean;
  status: 'active' | 'deleted';
  notificationStatus: 'pending_create' | 'pending_update' | 'pending_delete' | 'notified';
  isNotified?: boolean; // For backward compatibility
}

interface NotificationPreferences {
  email: boolean;
  phone: boolean;
  whatsapp: boolean;
  telegram: boolean;
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function App() {
  const [events, setEvents] = useState<TangoEvent[]>(() => {
    const saved = localStorage.getItem('tango_events');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map((e: any) => ({
          ...e,
          status: e.status || 'active',
          notificationStatus: e.notificationStatus || (e.isNotified ? 'notified' : 'pending_create')
        }));
      } catch (err) {
        return [];
      }
    }
    return [];
  });
  
  const [view, setView] = useState<'active' | 'trash'>('active');
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventToDelete, setEventToDelete] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isNotifying, setIsNotifying] = useState(false);

  // Notification Preferences State
  const [preferences, setPreferences] = useState<NotificationPreferences>(() => {
    const saved = localStorage.getItem('tango_preferences');
    return saved ? JSON.parse(saved) : {
      email: true,
      phone: false,
      whatsapp: false,
      telegram: true,
    };
  });

  // Form State
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [recurringDay, setRecurringDay] = useState('');
  const [time, setTime] = useState('');
  const [doneBefore, setDoneBefore] = useState(false);
  const [notes, setNotes] = useState('');
  const [isPublishedOnMeetup, setIsPublishedOnMeetup] = useState(false);

  useEffect(() => {
    localStorage.setItem('tango_events', JSON.stringify(events));
  }, [events]);

  useEffect(() => {
    localStorage.setItem('tango_preferences', JSON.stringify(preferences));
  }, [preferences]);

  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    if (editingEventId) {
      setEvents(prev => prev.map(ev => ev.id === editingEventId ? {
        ...ev,
        name,
        date: date || undefined,
        recurringDay: recurringDay || undefined,
        time: time || undefined,
        doneBefore,
        notes: notes || undefined,
        isPublishedOnMeetup,
        notificationStatus: ev.notificationStatus === 'pending_create' ? 'pending_create' : 'pending_update'
      } : ev));
      showToast("Event updated");
    } else {
      const newEvent: TangoEvent = {
        id: Date.now().toString(),
        name,
        date: date || undefined,
        recurringDay: recurringDay || undefined,
        time: time || undefined,
        doneBefore,
        notes: notes || undefined,
        isPublishedOnMeetup,
        status: 'active',
        notificationStatus: 'pending_create',
      };
      setEvents((prev) => [newEvent, ...prev]);
      showToast("Event added");
    }
    
    resetForm();
  };

  const handleEdit = (event: TangoEvent) => {
    setName(event.name);
    setDate(event.date || '');
    setRecurringDay(event.recurringDay || '');
    setTime(event.time || '');
    setDoneBefore(event.doneBefore);
    setNotes(event.notes || '');
    setIsPublishedOnMeetup(event.isPublishedOnMeetup);
    setEditingEventId(event.id);
    setIsAddingEvent(true);
  };

  const confirmDelete = () => {
    if (!eventToDelete) return;
    setEvents(prev => prev.map(e => e.id === eventToDelete ? {
      ...e,
      status: 'deleted',
      notificationStatus: 'pending_delete'
    } : e));
    setEventToDelete(null);
    showToast("Event moved to trash");
  };

  const handleRestore = (id: string) => {
    setEvents(prev => prev.map(e => e.id === id ? {
      ...e,
      status: 'active',
      notificationStatus: 'pending_update'
    } : e));
    showToast("Event restored");
  };

  const handlePermanentDelete = (id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id));
    showToast("Event permanently deleted");
  };

  const handleDuplicate = (event: TangoEvent) => {
    setName(event.name);
    setDate('');
    setRecurringDay('');
    setTime('');
    setDoneBefore(true);
    setNotes('');
    setIsPublishedOnMeetup(false);
    setEditingEventId(null);
    setIsAddingEvent(true);
  };

  const resetForm = () => {
    setName('');
    setDate('');
    setRecurringDay('');
    setTime('');
    setDoneBefore(false);
    setNotes('');
    setIsPublishedOnMeetup(false);
    setEditingEventId(null);
    setIsAddingEvent(false);
  };

  const handleNotify = async () => {
    const pendingEvents = events.filter(e => e.notificationStatus !== 'notified');

    if (pendingEvents.length === 0) {
      showToast("No new updates to notify about.");
      return;
    }

    const enabledChannels = Object.entries(preferences)
      .filter(([_, isEnabled]) => isEnabled)
      .map(([channel]) => channel);

    if (enabledChannels.length === 0) {
      showToast("No notification channels are enabled in Settings.");
      return;
    }

    setIsNotifying(true);
    showToast("Sending notifications...");

    try {
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: pendingEvents, preferences })
      });
      
      const data = await res.json();

      if (data.errors && data.errors.length > 0) {
        console.error("Notification errors:", data.errors);
        if (data.errors.some((e: string) => e.includes("chat ID"))) {
          showToast("Telegram error: Please send a message to your bot first!");
        } else {
          showToast("Some notifications failed. Check console.");
        }
      } else {
        showToast("Notifications sent successfully!");
      }

      // Mark as notified
      setEvents(prev => prev.map(e => 
        pendingEvents.find(pe => pe.id === e.id) ? { ...e, notificationStatus: 'notified' } : e
      ));

    } catch (err) {
      showToast("Failed to send notifications.");
    } finally {
      setIsNotifying(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const togglePreference = (key: keyof NotificationPreferences) => {
    setPreferences(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const eventsToDisplay = events.filter(e => view === 'trash' ? e.status === 'deleted' : e.status === 'active');
  const pendingCount = events.filter(e => e.notificationStatus !== 'notified').length;
  const uniqueEventNames = Array.from(new Set(events.map(e => e.name))).filter(Boolean);

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 font-sans">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight text-stone-800">TangoYoungNRW Schedule</h1>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-stone-500 hover:bg-stone-100 rounded-full transition-colors"
              title="Notification Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button 
              onClick={handleNotify}
              disabled={isNotifying || pendingCount === 0}
              className={`p-2 rounded-full transition-all relative ${
                isNotifying ? 'text-stone-400 bg-stone-100 cursor-not-allowed' :
                pendingCount > 0 ? 'text-white bg-stone-800 hover:bg-stone-700 shadow-md hover:shadow-lg' : 
                'text-stone-500 hover:bg-stone-100'
              }`}
              title="Send Notifications"
            >
              <Bell className={`w-5 h-5 ${isNotifying ? 'animate-pulse' : ''}`} />
              {pendingCount > 0 && !isNotifying && (
                <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-yellow-400 border-2 border-stone-800 rounded-full"></span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* View Toggle */}
        <div className="flex gap-2 mb-6 bg-stone-200 p-1 rounded-xl w-fit">
          <button 
            onClick={() => setView('active')} 
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === 'active' ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500 hover:text-stone-700'}`}
          >
            Active
          </button>
          <button 
            onClick={() => setView('trash')} 
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === 'trash' ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500 hover:text-stone-700'}`}
          >
            Trash
          </button>
        </div>

        {eventsToDisplay.length === 0 ? (
          <div className="text-center py-20">
            <Calendar className="w-12 h-12 text-stone-300 mx-auto mb-4" />
            <p className="text-stone-500 text-lg">
              {view === 'active' ? "No events scheduled yet." : "Trash is empty."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {eventsToDisplay.map((event) => (
              <div key={event.id} className="bg-white p-5 rounded-2xl shadow-sm border border-stone-100 hover:shadow-md transition-shadow group relative">
                
                {/* Badges */}
                <div className="absolute top-4 right-4 flex gap-2">
                  {event.notificationStatus === 'pending_create' && (
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-bold rounded-md uppercase tracking-wider">New</span>
                  )}
                  {event.notificationStatus === 'pending_update' && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded-md uppercase tracking-wider">Updated</span>
                  )}
                  {event.notificationStatus === 'pending_delete' && (
                    <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-bold rounded-md uppercase tracking-wider">Deleted</span>
                  )}
                </div>

                {/* Actions */}
                <div className="absolute top-12 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {view === 'active' ? (
                    <>
                      <button onClick={() => handleDuplicate(event)} className="p-2 text-stone-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Duplicate Event">
                        <Copy className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleEdit(event)} className="p-2 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit Event">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEventToDelete(event.id)} className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete Event">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => handleRestore(event.id)} className="p-2 text-stone-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Restore Event">
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button onClick={() => handlePermanentDelete(event.id)} className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Permanently Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>

                <div className="pr-20">
                  <h3 className="text-xl font-semibold text-stone-800 mb-3">{event.name}</h3>
                  
                  <div className="flex flex-wrap gap-y-2 gap-x-4 text-sm text-stone-600 mb-4">
                    {event.date && (
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-stone-400" />
                        <span>{event.date}</span>
                      </div>
                    )}
                    {event.recurringDay && (
                      <div className="flex items-center gap-1.5">
                        <Repeat className="w-4 h-4 text-stone-400" />
                        <span>Every {event.recurringDay}</span>
                      </div>
                    )}
                    {event.time && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-stone-400" />
                        <span>{event.time}</span>
                      </div>
                    )}
                  </div>

                  {event.notes && (
                    <div className="flex items-start gap-2 text-sm text-stone-600 bg-stone-50 p-3 rounded-xl mb-3">
                      <FileText className="w-4 h-4 text-stone-400 mt-0.5 shrink-0" />
                      <p className="whitespace-pre-wrap">{event.notes}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 mt-4">
                    {event.doneBefore && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-stone-100 text-stone-600 text-xs font-medium">
                        <Check className="w-3 h-3" /> Done Before
                      </span>
                    )}
                    {event.isPublishedOnMeetup && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-600 text-xs font-medium">
                        <Check className="w-3 h-3" /> Published on Meetup
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Floating Add Button */}
      {view === 'active' && (
        <button
          onClick={() => setIsAddingEvent(true)}
          className="fixed bottom-8 right-8 w-14 h-14 bg-stone-900 hover:bg-stone-800 text-white rounded-full shadow-xl hover:shadow-2xl flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Add/Edit Event Modal */}
      {isAddingEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between shrink-0">
              <h2 className="text-xl font-semibold text-stone-800">
                {editingEventId ? 'Edit Event' : 'Add New Event'}
              </h2>
              <button onClick={resetForm} className="p-2 text-stone-400 hover:bg-stone-100 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <form id="event-form" onSubmit={handleAddEvent} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Event Name *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    list="past-event-names"
                    className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900 focus:bg-white transition-all"
                    placeholder="e.g. Milonga Night"
                  />
                  <datalist id="past-event-names">
                    {uniqueEventNames.map((eventName, idx) => (
                      <option key={idx} value={eventName} />
                    ))}
                  </datalist>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1.5">Specific Date</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900 focus:bg-white transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1.5">Time</label>
                    <input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900 focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Recurring Day</label>
                  <select
                    value={recurringDay}
                    onChange={(e) => setRecurringDay(e.target.value)}
                    className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900 focus:bg-white transition-all"
                  >
                    <option value="">Not recurring</option>
                    {DAYS_OF_WEEK.map(day => (
                      <option key={day} value={day}>Every {day}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900 focus:bg-white transition-all resize-none"
                    placeholder="Any additional details..."
                  />
                </div>

                <div className="space-y-3 pt-2">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative flex items-center justify-center w-5 h-5">
                      <input
                        type="checkbox"
                        checked={doneBefore}
                        onChange={(e) => setDoneBefore(e.target.checked)}
                        className="peer appearance-none w-5 h-5 border-2 border-stone-300 rounded focus:ring-2 focus:ring-stone-900 focus:ring-offset-2 checked:bg-stone-900 checked:border-stone-900 transition-all cursor-pointer"
                      />
                      <Check className="absolute w-3.5 h-3.5 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" />
                    </div>
                    <span className="text-sm text-stone-700 group-hover:text-stone-900">We have done this event before</span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative flex items-center justify-center w-5 h-5">
                      <input
                        type="checkbox"
                        checked={isPublishedOnMeetup}
                        onChange={(e) => setIsPublishedOnMeetup(e.target.checked)}
                        className="peer appearance-none w-5 h-5 border-2 border-stone-300 rounded focus:ring-2 focus:ring-stone-900 focus:ring-offset-2 checked:bg-red-500 checked:border-red-500 transition-all cursor-pointer"
                      />
                      <Check className="absolute w-3.5 h-3.5 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" />
                    </div>
                    <span className="text-sm text-stone-700 group-hover:text-stone-900">Published on Meetup</span>
                  </label>
                </div>
              </form>
            </div>
            
            <div className="px-6 py-4 border-t border-stone-100 bg-stone-50 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={resetForm}
                className="px-5 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="event-form"
                className="px-5 py-2.5 text-sm font-medium bg-stone-900 hover:bg-stone-800 text-white rounded-xl shadow-sm transition-colors"
              >
                {editingEventId ? 'Save Changes' : 'Add Event'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {eventToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden p-6">
            <h3 className="text-xl font-semibold text-stone-900 mb-2">Delete Event?</h3>
            <p className="text-stone-600 mb-6">Are you sure you want to delete this event? It will be moved to the Trash.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setEventToDelete(null)} className="px-5 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-100 rounded-xl transition-colors">
                Cancel
              </button>
              <button onClick={confirmDelete} className="px-5 py-2.5 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-stone-800">Notification Settings</h2>
              <button onClick={() => setIsSettingsOpen(false)} className="p-2 text-stone-400 hover:bg-stone-100 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-sm text-stone-500 mb-4">Choose where you want to receive alerts when you click the bell icon.</p>
              
              {(Object.keys(preferences) as Array<keyof NotificationPreferences>).map((key) => (
                <label key={key} className="flex items-center justify-between p-3 rounded-xl hover:bg-stone-50 cursor-pointer transition-colors border border-transparent hover:border-stone-100">
                  <span className="text-stone-700 font-medium capitalize">{key}</span>
                  <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${preferences[key] ? 'bg-stone-900' : 'bg-stone-200'}`}>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={preferences[key]}
                      onChange={() => togglePreference(key)}
                    />
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${preferences[key] ? 'translate-x-6' : 'translate-x-1'}`} />
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-stone-800 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4 z-50">
          <Check className="w-4 h-4 text-green-400" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

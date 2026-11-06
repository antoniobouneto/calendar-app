"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, Lock, LogOut, User, Plus, ShieldCheck, KeyRound, AlertCircle, Mail, Smartphone, Download, Send, CheckCircle2 } from 'lucide-react';

interface Event {
  id: number;
  title: string;
  date: string;
  titulo?: string;
  dataInicio?: string;
  dataFim?: string;
  descricao?: string | null;
  diaInteiro?: boolean;
}

const HORAS_DO_DIA = Array.from({ length: 24 }, (_, h) => h);
const pad2 = (n: number) => String(n).padStart(2, '0');
const horaLabel = (h: number) => `${pad2(h)}:00`;

// Monta ISO local a partir do dia selecionado + horário "HH:MM".
// Usa construtor local (new Date(y,m,d,h,min)) para não sofrer shift de UTC
// quando o browser interpreta "YYYY-MM-DD" como meia-noite UTC.
const buildISO = (dia: Date, hhmm: string) => {
  const [h, min] = hhmm.split(':').map(Number);
  return new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), h, min ?? 0, 0, 0);
};

// Buckets: separa diaInteiro dos eventos com horário, já agrupados por hora inicial.
const agruparPorHora = (eventos: Event[], dia: Date) => {
  const doDia = eventos.filter((e) => {
    const inicio = new Date((e.dataInicio as string) || e.date);
    const fim = new Date(((e.dataFim as string) || e.date) as string);
    // Inclui quem começa no dia OU atravessa o dia (sobreposição).
    const inicioDia = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 0, 0, 0, 0);
    const fimDia = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 23, 59, 59, 999);
    return inicio <= fimDia && fim >= inicioDia;
  });
  const diaTodo = doDia.filter((e) => e.diaInteiro);
  const porHora = new Map<number, Event[]>();
  for (const e of doDia) {
    if (e.diaInteiro) continue;
    const inicio = new Date((e.dataInicio as string) || e.date);
    if (isNaN(inicio.getTime())) continue;
    // Só considera a hora se o início cai neste dia (atravessado aparece no dia de início).
    if (inicio.toDateString() !== dia.toDateString()) continue;
    const h = inicio.getHours();
    if (!porHora.has(h)) porHora.set(h, []);
    porHora.get(h)!.push(e);
  }
  return { diaTodo, porHora };
};

interface UserProfile {
  id: string;
  email: string;
  roles: string[];
}

const Calendar = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Auth State
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showAddEventModal, setShowAddEventModal] = useState(false);

  // Login Form State
  const [emailInput, setEmailInput] = useState('admin@calendar.com');
  const [passwordInput, setPasswordInput] = useState('admin123');
  const [authLoading, setAuthLoading] = useState(false);

  // New Event Form State (grade horária — múltiplos eventos no mesmo dia)
  const [eventTitle, setEventTitle] = useState('');
  const [eventDateStr, setEventDateStr] = useState('');
  const [eventStartTime, setEventStartTime] = useState('09:00');
  const [eventEndTime, setEventEndTime] = useState('10:00');
  const [eventAllDay, setEventAllDay] = useState(false);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);

  // Abre o modal já posicionado numa hora da grade (clique em "09:00" vira 09:00–10:00).
  const openNewEvent = (hora?: number) => {
    if (!isAdmin) {
      alert('Restrição OWASP RBAC: Apenas o nível ADMIN pode criar novos eventos! Faça login como admin@calendar.com.');
      return;
    }
    if (typeof hora === 'number') {
      const inicio = pad2(hora);
      setSelectedHour(hora);
      setEventStartTime(`${inicio}:00`);
      setEventEndTime(`${pad2((hora + 1) % 24)}:00`);
      setEventAllDay(false);
    }
    setShowAddEventModal(true);
  };

  // Export (e-mail / .ics) State
  const [exportEmail, setExportEmail] = useState('');
  const [exportScope, setExportScope] = useState<'month' | 'all'>('month');
  const [exportLoading, setExportLoading] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<{ type: 'ok' | 'warn' | 'err'; text: string } | null>(null);

  // Load Auth State from LocalStorage
  useEffect(() => {
    const savedToken = localStorage.getItem('calendar_jwt');
    const savedUser = localStorage.getItem('calendar_user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      try {
        const parsed = JSON.parse(savedUser);
        setUser(parsed);
        if (parsed?.email) setExportEmail(parsed.email);
      } catch {
        localStorage.removeItem('calendar_user');
      }
    }
  }, []);

  useEffect(() => {
    if (user?.email) setExportEmail((prev) => prev || user.email);
  }, [user]);

  // Fetch Events when Token changes
  const fetchEvents = useCallback(async (authToken: string | null) => {
    if (!authToken) {
      setEvents([]);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('http://localhost:5000/api/events', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setErrorMsg('Sessão expirada ou sem acesso. Faça login novamente.');
        } else {
          setErrorMsg('Erro ao carregar eventos do servidor.');
        }
        setEvents([]);
        return;
      }

      const data = await res.json();
      setEvents(data);
    } catch {
      setErrorMsg('Não foi possível conectar ao servidor backend (porta 5000).');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents(token);
  }, [token, fetchEvents]);

  // Handle Login
  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput, password: passwordInput }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Falha ao autenticar.');
      }

      setToken(data.access_token);
      setUser(data.user);
      localStorage.setItem('calendar_jwt', data.access_token);
      localStorage.setItem('calendar_user', JSON.stringify(data.user));
      setShowLoginModal(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao realizar login');
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    if (token) {
      try {
        await fetch('http://localhost:5000/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        });
      } catch {
        // Ignore logout errors
      }
    }
    setToken(null);
    setUser(null);
    localStorage.removeItem('calendar_jwt');
    localStorage.removeItem('calendar_user');
    setEvents([]);
  };

  // Handle Create Event (grade horária — permite vários eventos no mesmo dia)
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!eventTitle.trim()) return;

    // Monta o intervalo [início, fim] a partir da hora escolhida naive grade.
    const dataInicio = eventAllDay
      ? new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 0, 0, 0, 0)
      : buildISO(selectedDate, eventStartTime);
    const dataFim = eventAllDay
      ? new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59, 999)
      : buildISO(selectedDate, eventEndTime);
    if (!eventAllDay && dataFim.getTime() <= dataInicio.getTime()) {
      alert('Horário de término deve ser posterior ao horário de início. Ajuste a grade (ex: 09:00 → 10:30).');
      return;
    }

    try {
      const res = await fetch('http://localhost:5000/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          // legado (mantido para compatibilidade)
          title: eventTitle,
          date: dataInicio.toISOString(),
          // especificação (remodelação horária)
          titulo: eventTitle,
          dataInicio: dataInicio.toISOString(),
          dataFim: dataFim.toISOString(),
          diaInteiro: eventAllDay,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message;
        alert(msg || 'Apenas Administradores podem criar novos eventos!');
        return;
      }

      setShowAddEventModal(false);
      setEventTitle('');
      setSelectedHour(null);
      fetchEvents(token);
    } catch {
      alert('Erro de conexão ao criar evento.');
    }
  };

  // Export: envia e-mail com anexo .ics para importar no celular
  const handleExportEmail = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!token) return;
    const destino = exportEmail.trim();
    if (!destino || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destino)) {
      setExportFeedback({ type: 'err', text: 'Digite um e-mail válido para receber a agenda no celular.' });
      return;
    }
    setExportLoading(true);
    setExportFeedback(null);
    try {
      const payload: Record<string, unknown> = { destination: destino };
      if (exportScope === 'month') {
        payload.mes = currentDate.getMonth() + 1;
        payload.ano = currentDate.getFullYear();
      }
      const res = await fetch('http://localhost:5000/api/events/export-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = Array.isArray(data?.message) ? data.message.join(', ') : data?.message;
        throw new Error(msg || 'Falha ao enviar e-mail.');
      }
      if (data?.simulated) {
        setExportFeedback({ type: 'warn', text: data?.message || 'E-mail preparado em modo simulação. Use "Baixar .ics" ou configure SMTP no backend.' });
      } else {
        setExportFeedback({ type: 'ok', text: `E-mail enviado para ${destino} com ${data?.total ?? ''} evento(s). Abra no celular e toque em eventos.ics.` });
      }
    } catch (err: any) {
      setExportFeedback({ type: 'err', text: err?.message || 'Erro ao enviar e-mail de exportação.' });
    } finally {
      setExportLoading(false);
    }
  };

  const handleDownloadICS = async () => {
    if (!token) return;
    setExportLoading(true);
    setExportFeedback(null);
    try {
      const params = exportScope === 'month'
        ? `?mes=${currentDate.getMonth() + 1}&ano=${currentDate.getFullYear()}`
        : '';
      const res = await fetch(`http://localhost:5000/api/events/export.ics${params}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Não foi possível gerar o arquivo .ics.');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportScope === 'month'
        ? `eventos-${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}.ics`
        : 'eventos.ics';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setExportFeedback({ type: 'ok', text: 'Arquivo .ics baixado. Transfira para o celular e importe no calendário.' });
    } catch (err: any) {
      setExportFeedback({ type: 'err', text: err?.message || 'Erro ao baixar .ics.' });
    } finally {
      setExportLoading(false);
    }
  };

  const quickFillLogin = (email: string, pass: string) => {
    setEmailInput(email);
    setPasswordInput(pass);
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  const isAdmin = user?.roles?.includes('ADMIN');

  const renderDays = () => {
    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-24 w-full border border-white/5 bg-white/5 backdrop-blur-md rounded-xl m-1 opacity-50"></div>);
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      const isToday = new Date().toDateString() === date.toDateString();
      const isSelected = selectedDate.toDateString() === date.toDateString();
      
      const dayEvents = events.filter(e => new Date(e.date).toDateString() === date.toDateString());

      days.push(
        <div 
          key={i} 
          onClick={() => {
            setSelectedDate(date);
            setEventDateStr(date.toISOString());
          }}
          className={`h-24 w-full m-1 rounded-xl border flex flex-col p-2 transition-all duration-300 cursor-pointer overflow-hidden relative group
            ${isSelected ? 'border-purple-500 bg-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.4)]' : 'border-white/10 bg-white/10 hover:bg-white/20'}
            ${isToday ? 'ring-2 ring-blue-400' : ''}
            backdrop-blur-md
          `}
        >
          <div className={`text-sm font-semibold mb-1 ${isToday ? 'text-blue-400' : 'text-gray-200'}`}>{i}</div>
          <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
            {dayEvents.map(event => {
              const inicio = new Date((event.dataInicio as string) || event.date);
              const labelHora = event.diaInteiro
                ? 'Dia todo'
                : isNaN(inicio.getTime())
                  ? ''
                  : `${pad2(inicio.getHours())}:${pad2(inicio.getMinutes())}`;
              return (
                <div key={event.id} className="text-xs px-2 py-1 bg-gradient-to-r from-purple-600/80 to-blue-600/80 rounded-md text-white shadow-sm">
                  <span className="font-bold">{labelHora}</span>{' '}
                  <span className="truncate inline-block max-w-[110px] align-bottom">{event.title}</span>
                </div>
              );
            })}
          </div>
          
          <div className="absolute inset-0 bg-gradient-to-b from-white/0 to-white/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl pointer-events-none"></div>
        </div>
      );
    }
    return days;
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto p-4 sm:p-6 flex flex-col gap-6">
      {/* Auth Status Header Bar */}
      <div className="bg-black/40 backdrop-blur-2xl rounded-2xl p-4 border border-white/10 flex flex-wrap justify-between items-center gap-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
            <ShieldCheck size={20} />
          </div>
          <div>
            <p className="text-xs text-gray-400 font-medium">Status de Autenticação JWT + Redis</p>
            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">{user.email}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${isAdmin ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50' : 'bg-blue-500/30 text-blue-300 border border-blue-500/50'}`}>
                  Nível: {user.roles?.join(', ')}
                </span>
              </div>
            ) : (
              <span className="text-sm text-yellow-400 font-medium">Não autenticado (Faça login para ver o calendário)</span>
            )}
          </div>
        </div>

        <div>
          {user ? (
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 font-medium text-sm transition-all"
            >
              <LogOut size={16} />
              Sair
            </button>
          ) : (
            <button
              onClick={() => setShowLoginModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold text-sm shadow-[0_0_15px_rgba(168,85,247,0.4)] transition-all"
            >
              <KeyRound size={16} />
              Entrar (JWT Login)
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-900/30 border border-red-500/40 text-red-300 flex items-center gap-3 text-sm animate-fade-in">
          <AlertCircle size={20} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Panel: Exportar para o celular por e-mail */}
        <div className="w-full lg:w-80 shrink-0 flex flex-col gap-6">
          <div className="bg-black/40 backdrop-blur-2xl rounded-3xl p-6 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] relative overflow-hidden">
            <div className="absolute -top-20 -left-20 w-56 h-56 bg-purple-600/20 rounded-full blur-[80px] pointer-events-none"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  <Smartphone size={20} />
                </div>
                <h3 className="text-lg font-bold text-white">Exportar para o celular</h3>
              </div>
              <p className="text-sm text-gray-400 mb-5">
                Envie os eventos por e-mail com anexo <span className="text-gray-200 font-medium">eventos.ics</span> e importe direto no calendário do celular.
              </p>
              {!token ? (
                <div className="text-center py-8 space-y-3">
                  <Lock className="mx-auto text-yellow-400" size={28} />
                  <p className="text-gray-300 text-sm font-medium">Faça login para exportar</p>
                  <p className="text-gray-500 text-xs">A exportação usa sua sessão JWT.</p>
                  <button
                    onClick={() => setShowLoginModal(true)}
                    className="mt-1 px-4 py-2 rounded-xl bg-purple-600/40 hover:bg-purple-600/60 border border-purple-500/50 text-purple-200 font-semibold text-xs transition-all"
                  >
                    Fazer Login
                  </button>
                </div>
              ) : (
                <form onSubmit={handleExportEmail} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">Seu e-mail (celular)</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                      <input
                        type="email"
                        value={exportEmail}
                        onChange={(e) => setExportEmail(e.target.value)}
                        placeholder="voce@exemplo.com"
                        required
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">Escopo</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setExportScope('month')}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${exportScope === 'month' ? 'border-purple-500 bg-purple-500/20 text-purple-200' : 'border-white/10 bg-white/5 text-gray-400 hover:bg-white/10'}`}
                      >
                        Este mês
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportScope('all')}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${exportScope === 'all' ? 'border-purple-500 bg-purple-500/20 text-purple-200' : 'border-white/10 bg-white/5 text-gray-400 hover:bg-white/10'}`}
                      >
                        Todos
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1">
                      {exportScope === 'month'
                        ? `Exporta ${monthNames[month]} ${year}, mês visível no calendário.`
                        : 'Exporta todos os eventos cadastrados.'}
                    </p>
                  </div>
                  {exportFeedback && (
                    <div className={`p-3 rounded-xl text-xs flex items-start gap-2 border ${exportFeedback.type === 'ok' ? 'bg-emerald-900/30 border-emerald-500/40 text-emerald-200' : exportFeedback.type === 'warn' ? 'bg-yellow-900/30 border-yellow-500/40 text-yellow-200' : 'bg-red-900/30 border-red-500/40 text-red-200'}`}>
                      {exportFeedback.type === 'ok' ? <CheckCircle2 size={14} className="shrink-0 mt-0.5" /> : <AlertCircle size={14} className="shrink-0 mt-0.5" />}
                      <span>{exportFeedback.text}</span>
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={exportLoading}
                    className="w-full py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold text-sm shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Send size={16} />
                    {exportLoading ? 'Enviando...' : 'Enviar por e-mail'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadICS}
                    disabled={exportLoading}
                    className="w-full py-2.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 text-gray-200 font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Download size={16} />
                    Baixar .ics (sem e-mail)
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* Calendar Grid Section */}
        <div className="flex-1 bg-black/40 backdrop-blur-2xl rounded-3xl p-6 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] relative overflow-hidden">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-purple-600/30 rounded-full blur-[100px] pointer-events-none"></div>
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-600/20 rounded-full blur-[100px] pointer-events-none"></div>

          <div className="flex justify-between items-center mb-8 relative z-10">
            <h2 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-200 to-gray-400">
              {monthNames[month]} {year}
            </h2>
            <div className="flex gap-2">
              <button onClick={prevMonth} className="p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-white">
                <ChevronLeft size={20} />
              </button>
              <button onClick={nextMonth} className="p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-white">
                <ChevronRight size={20} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2 relative z-10">
            {dayNames.map(day => (
              <div key={day} className="text-center font-medium text-gray-400 text-sm py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 relative z-10">
            {renderDays()}
          </div>
        </div>

        {/* Sidebar Section */}
        <div className="w-full lg:w-96 shrink-0 flex flex-col gap-6">
          <div className="bg-black/40 backdrop-blur-2xl rounded-3xl p-8 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] relative overflow-hidden flex-1">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/20 rounded-full blur-[80px] pointer-events-none"></div>
            
            <div className="flex items-center gap-4 mb-8 relative z-10">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-white/10">
                <CalendarIcon className="text-purple-400" size={32} />
              </div>
              <div>
                <p className="text-gray-400 font-medium text-sm">Data Selecionada</p>
                <h3 className="text-xl font-bold text-white">
                  {selectedDate.toLocaleDateString('pt-BR', { weekday: 'short', month: 'long', day: 'numeric' })}
                </h3>
              </div>
            </div>

            <div className="relative z-10">
              <div className="flex items-baseline justify-between border-b border-white/10 pb-2 mb-3">
                <h4 className="text-lg font-semibold text-gray-200">Eventos do Dia</h4>
                <span className="text-[11px] text-gray-500">Grade 00–23h · clique numa hora para agendar</span>
              </div>

              {!token ? (
                <div className="text-center py-12 space-y-3">
                  <Lock className="mx-auto text-yellow-400" size={32} />
                  <p className="text-gray-300 font-medium">Conteúdo Protegido por JWT</p>
                  <p className="text-gray-500 text-xs">Faça login para consultar a agenda do calendário.</p>
                  <button
                    onClick={() => setShowLoginModal(true)}
                    className="mt-2 px-4 py-2 rounded-xl bg-purple-600/40 hover:bg-purple-600/60 border border-purple-500/50 text-purple-200 font-semibold text-xs transition-all"
                  >
                    Fazer Login
                  </button>
                </div>
              ) : loading ? (
                <div className="animate-pulse flex space-x-4 py-6">
                  <div className="flex-1 space-y-4">
                    <div className="h-4 bg-white/20 rounded"></div>
                    <div className="h-4 bg-white/20 rounded w-5/6"></div>
                  </div>
                </div>
              ) : (
                (() => {
                  const { diaTodo, porHora } = agruparPorHora(events, selectedDate);
                  const totalSlots = porHora.size + diaTodo.length;
                  const ehHoje = new Date().toDateString() === selectedDate.toDateString();
                  const horaAtual = new Date().getHours();
                  return (
                    <div className="space-y-3">
                      {diaTodo.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Dia todo</p>
                          {diaTodo.map((event) => (
                            <div key={event.id} className="group p-3 rounded-2xl bg-gradient-to-r from-purple-600/30 to-blue-600/30 border border-purple-500/30 flex items-start gap-3">
                              <div className="mt-0.5 p-2 rounded-lg bg-purple-500/20 text-purple-300">
                                <Clock size={14} />
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-white truncate">{event.title}</p>
                                <p className="text-xs text-gray-400">Dia todo</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="max-h-[540px] overflow-y-auto custom-scrollbar pr-1 -mr-1">
                        {HORAS_DO_DIA.map((h) => {
                          const slots = porHora.get(h) ?? [];
                          const ehHoraAtual = ehHoje && h === horaAtual;
                          const ehSelecionada = selectedHour === h;
                          return (
                            <div key={h} className="flex gap-3 py-1.5">
                              <button
                                type="button"
                                onClick={() => openNewEvent(h)}
                                title={slots.length ? 'Adicionar outro evento às ' + horaLabel(h) : 'Agendar às ' + horaLabel(h)}
                                className={`shrink-0 w-14 text-xs font-mono font-bold py-1.5 rounded-lg border transition-all ${ehHoraAtual ? 'border-blue-400 bg-blue-500/20 text-blue-300' : ehSelecionada ? 'border-purple-500 bg-purple-500/20 text-purple-200' : 'border-white/10 bg-white/5 text-gray-300 hover:bg-purple-500/20 hover:text-purple-200'}`}
                              >
                                {horaLabel(h)}
                              </button>
                              <div className={`flex-1 min-h-[44px] rounded-xl border px-3 py-2 transition-all ${ehHoraAtual ? 'border-blue-400/50 bg-blue-500/10' : ehSelecionada ? 'border-purple-500/60 bg-purple-500/10' : 'border-white/10 bg-white/[0.04]'}`}>
                                {slots.length === 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => openNewEvent(h)}
                                    className="w-full h-full flex items-center gap-2 text-xs text-gray-600 hover:text-purple-300 transition-colors py-1"
                                  >
                                    <Plus size={12} />
                                    <span>{isAdmin ? 'Livre · + agendar' : 'Livre'}</span>
                                  </button>
                                ) : (
                                  <div className="space-y-1.5">
                                    {slots.map((event) => {
                                      const inicio = new Date((event.dataInicio as string) || event.date);
                                      const fim = new Date(((event.dataFim as string) || event.date) as string);
                                      const textoHora = isNaN(inicio.getTime())
                                        ? ''
                                        : `${pad2(inicio.getHours())}:${pad2(inicio.getMinutes())}–${pad2(fim.getHours())}:${pad2(fim.getMinutes())}`;
                                      return (
                                        <div key={event.id} className="flex items-center gap-2">
                                          <div className="mt-0.5 p-1.5 rounded-lg bg-blue-500/20 text-blue-400 shrink-0">
                                            <Clock size={12} />
                                          </div>
                                          <div className="min-w-0">
                                            <p className="text-sm font-semibold text-white leading-tight truncate">{event.title}</p>
                                            <p className="text-[11px] text-gray-400 font-mono">{textoHora}</p>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {totalSlots === 0 && (
                        <p className="text-gray-500 italic text-sm text-center pt-2">Nenhum evento agendado para este dia. Clique numa hora para criar o primeiro.</p>
                      )}
                      <p className="text-[11px] text-gray-600 text-center pt-1">Vários eventos no mesmo dia são permitidos — cada hora é um slot independente.</p>
                    </div>
                  );
                })()
              )}
            </div>
            
            {token && (
              <button 
                onClick={() => openNewEvent(selectedHour ?? undefined)}
                className={`w-full mt-8 py-4 rounded-2xl font-bold text-lg transition-all relative z-10 flex items-center justify-center gap-2
                  ${isAdmin 
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)]' 
                    : 'bg-white/10 text-gray-400 cursor-not-allowed border border-white/10'}
                `}
              >
                <Plus size={20} />
                + Novo Evento {isAdmin ? '(Admin)' : '(Bloqueado)'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Login */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="bg-[#121216] border border-white/15 rounded-3xl p-8 max-w-md w-full shadow-2xl relative">
            <h3 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
              <KeyRound className="text-purple-400" />
              Autenticação JWT (Redis)
            </h3>
            <p className="text-gray-400 text-sm mb-6">
              Escolha um dos perfis pré-configurados para testar o controle de privilégios (RBAC):
            </p>

            {/* Quick Fill Presets */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button
                type="button"
                onClick={() => quickFillLogin('admin@calendar.com', 'admin123')}
                className={`p-3 rounded-xl border text-left transition-all ${emailInput === 'admin@calendar.com' ? 'border-purple-500 bg-purple-500/20' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
              >
                <div className="flex items-center gap-1 text-purple-400 font-semibold text-xs mb-1">
                  <ShieldCheck size={14} /> Admin
                </div>
                <div className="text-xs text-white truncate">admin@calendar.com</div>
              </button>

              <button
                type="button"
                onClick={() => quickFillLogin('user@calendar.com', 'user123')}
                className={`p-3 rounded-xl border text-left transition-all ${emailInput === 'user@calendar.com' ? 'border-blue-500 bg-blue-500/20' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
              >
                <div className="flex items-center gap-1 text-blue-400 font-semibold text-xs mb-1">
                  <User size={14} /> Usuário
                </div>
                <div className="text-xs text-white truncate">user@calendar.com</div>
              </button>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">Senha</label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowLoginModal(false)}
                  className="px-5 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-gray-300 text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={authLoading}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold text-sm shadow-lg hover:opacity-90 disabled:opacity-50"
                >
                  {authLoading ? 'Entrando...' : 'Entrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Criar Evento */}
      {showAddEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="bg-[#121216] border border-white/15 rounded-3xl p-8 max-w-md w-full shadow-2xl relative">
            <h3 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
              <Plus className="text-purple-400" />
              Novo Evento (Apenas Admin)
            </h3>
            <p className="text-gray-400 text-sm mb-6">
              Adicione um novo compromisso ao calendário para a data selecionada.
            </p>

            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">Título do Evento</label>
                <input
                  type="text"
                  placeholder="Ex: Reunião com Cliente"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">Data</label>
                <input
                  type="text"
                  value={selectedDate.toLocaleDateString('pt-BR')}
                  disabled
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-gray-400 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-300 mb-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={eventAllDay}
                    onChange={(e) => setEventAllDay(e.target.checked)}
                    className="accent-purple-500 w-4 h-4"
                  />
                  Dia inteiro (00:00 → 23:59)
                </label>
              </div>

              {!eventAllDay && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">Início</label>
                    <select
                      value={eventStartTime}
                      onChange={(e) => setEventStartTime(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-[#121216] border border-white/10 text-white focus:outline-none focus:border-purple-500"
                    >
                      {HORAS_DO_DIA.map((h) => (
                        <option key={`ini-${h}`} value={`${pad2(h)}:00`}>{horaLabel(h)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">Término</label>
                    <select
                      value={eventEndTime}
                      onChange={(e) => setEventEndTime(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-[#121216] border border-white/10 text-white focus:outline-none focus:border-purple-500"
                    >
                      {HORAS_DO_DIA.map((h) => (
                        <option key={`fim-${h}`} value={`${pad2(h)}:00`}>{horaLabel(h)}</option>
                      ))}
                    </select>
                  </div>
                  <p className="col-span-2 text-[11px] text-gray-500">
                    {selectedHour !== null
                      ? `Slot selecionado: ${horaLabel(selectedHour)} · pode agendar vários eventos no mesmo dia em horas diferentes.`
                      : 'Escolha a hora de início e término — você pode agendar vários eventos no mesmo dia.'}
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddEventModal(false)}
                  className="px-5 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-gray-300 text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold text-sm shadow-lg hover:opacity-90"
                >
                  Salvar Evento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Calendar;

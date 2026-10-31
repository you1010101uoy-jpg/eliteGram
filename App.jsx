import { useEffect, useMemo, useState } from 'react'
import { supabase, isSupabaseConfigured } from './supabase'
import { Crown, Send, Search, Plus, Paperclip, Smile, Moon, Sun, LogOut, Users, MessageCircle, Radio, Settings, X } from 'lucide-react'

const demoChats = [
  { id: 'demo-1', name: 'ELITIUM', username: '@elitium', preview: 'Добро пожаловать в ELITIUM', time: '12:40', unread: 1 },
  { id: 'demo-2', name: 'Избранное', username: 'Личное пространство', preview: 'Сохраняйте важные сообщения', time: 'Вчера', unread: 0 }
]

export default function App() {
  const [theme, setTheme] = useState(localStorage.getItem('elitium-theme') || 'dark')
  const [session, setSession] = useState(null)
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [profile, setProfile] = useState(null)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [chats, setChats] = useState(demoChats)
  const [activeChat, setActiveChat] = useState(demoChats[0])
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('chats')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('elitium-theme', theme)
  }, [theme])

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session || !supabase) return
    loadProfile()
  }, [session])

  async function loadProfile() {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
    if (error) { setNotice(error.message); return }
    setProfile(data)
    if (!data) setNotice('Создайте профиль, чтобы начать пользоваться ELITIUM.')
  }

  async function sendCode(e) {
    e.preventDefault()
    if (!supabase) return setNotice('Сначала подключите Supabase: заполните .env.local по инструкции README.')
    const { error } = await supabase.auth.signInWithOtp({ phone })
    if (error) setNotice(error.message)
    else { setOtpSent(true); setNotice('SMS-код отправлен. Если SMS не пришло, проверьте настройки SMS-провайдера в Supabase.') }
  }

  async function verifyCode(e) {
    e.preventDefault()
    const { data, error } = await supabase.auth.verifyOtp({ phone, token: otp, type: 'sms' })
    if (error) setNotice(error.message)
    else setSession(data.session)
  }

  async function saveProfile(e) {
    e.preventDefault()
    if (!username.trim() || !displayName.trim()) return setNotice('Заполните имя и @ID.')
    const clean = username.trim().replace(/^@/, '').toLowerCase()
    const { data, error } = await supabase.from('profiles').upsert({
      id: session.user.id, username: clean, display_name: displayName.trim(), phone_searchable: false
    }).select().single()
    if (error) setNotice(error.message)
    else { setProfile(data); setNotice('Профиль создан.') }
  }

  async function loadMessages(chat) {
    setActiveChat(chat)
    if (!supabase || String(chat.id).startsWith('demo')) {
      setMessages([{ id: 'welcome', body: 'Это демонстрационный экран. Подключите Supabase и создайте диалог, чтобы обмениваться сообщениями.', mine: false }])
      return
    }
    const { data, error } = await supabase.from('messages').select('*').eq('conversation_id', chat.id).order('created_at')
    if (error) setNotice(error.message)
    else setMessages((data || []).map(m => ({ ...m, mine: m.sender_id === session?.user?.id })))
  }

  async function sendMessage(e) {
    e.preventDefault()
    if (!draft.trim()) return
    if (!supabase || !session || !activeChat || String(activeChat.id).startsWith('demo')) {
      setMessages(prev => [...prev, { id: Date.now(), body: draft.trim(), mine: true }])
      setDraft('')
      return
    }
    const { error } = await supabase.from('messages').insert({
      conversation_id: activeChat.id, sender_id: session.user.id, body: draft.trim()
    })
    if (error) setNotice(error.message)
    else setDraft('')
  }

  useEffect(() => {
    if (!supabase || !session || !activeChat || String(activeChat.id).startsWith('demo')) return
    const channel = supabase.channel(`messages-${activeChat.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeChat.id}` },
        payload => setMessages(prev => [...prev, { ...payload.new, mine: payload.new.sender_id === session.user.id }]))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeChat?.id, session?.user?.id])

  async function signOut() {
    if (supabase) await supabase.auth.signOut()
    setProfile(null); setSession(null); setNotice('Вы вышли из аккаунта.')
  }

  const filteredChats = useMemo(() => chats.filter(c => `${c.name} ${c.username} ${c.preview}`.toLowerCase().includes(search.toLowerCase())), [chats, search])

  if (isSupabaseConfigured && session && !profile) {
    return <main className="auth-wrap"><section className="auth-card"><Brand /><h1>Создать профиль</h1><p>Придумайте имя и уникальный @ID.</p><form onSubmit={saveProfile}><label>Имя<input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Ваше имя" required /></label><label>Ваш @ID<input value={username} onChange={e=>setUsername(e.target.value)} placeholder="elite777" required /></label><button className="primary">Продолжить</button></form><Notice text={notice} /></section></main>
  }

  if (!session) return <main className="auth-wrap"><section className="auth-card"><Brand /><h1>Войти в ELITIUM</h1><p>Личный мессенджер в премиальном стиле.</p>{!otpSent ? <form onSubmit={sendCode}><label>Номер телефона<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+375..." type="tel" required /></label><button className="primary">Получить SMS-код</button></form> : <form onSubmit={verifyCode}><label>Код из SMS<input value={otp} onChange={e=>setOtp(e.target.value)} inputMode="numeric" placeholder="123456" required /></label><button className="primary">Подтвердить</button><button type="button" className="text-btn" onClick={()=>setOtpSent(false)}>Изменить номер</button></form>}<Notice text={notice || (!isSupabaseConfigured ? 'Сейчас открыт предварительный экран. Для входа настройте Supabase по README.' : '')} /></section></main>

  return <main className="app-shell">
    <aside className="sidebar">
      <header className="topbar"><Brand compact /><button className="icon-btn" onClick={()=>setTheme(theme==='dark'?'light':'dark')} title="Сменить тему">{theme==='dark'?<Sun/>:<Moon/>}</button></header>
      <div className="profile-strip"><div className="avatar">E</div><div><b>{profile?.display_name || 'ELITIUM user'}</b><small>@{profile?.username || 'member'}</small></div><button className="icon-btn" onClick={signOut}><LogOut/></button></div>
      <div className="tabs"><button className={tab==='chats'?'selected':''} onClick={()=>setTab('chats')}><MessageCircle/>Чаты</button><button className={tab==='channels'?'selected':''} onClick={()=>setTab('channels')}><Radio/>Каналы</button></div>
      <div className="searchbox"><Search/><input placeholder="Поиск" value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <div className="list-head"><span>{tab==='chats'?'Сообщения':'Каналы'}</span><button className="icon-btn" onClick={()=>setNotice('Создание каналов и новых диалогов будет подключено следующим этапом.')}><Plus/></button></div>
      <div className="chat-list">{filteredChats.map(chat=><button key={chat.id} className={`chat-row ${activeChat?.id===chat.id?'active':''}`} onClick={()=>loadMessages(chat)}><div className="avatar">{chat.name[0]}</div><div className="chat-info"><b>{chat.name}</b><small>{chat.preview}</small></div><time>{chat.time}</time></button>)}</div>
      <footer className="sidebar-footer"><span><Settings size={16}/> Настройки</span><small>ELITIUM · ранняя версия</small></footer>
    </aside>
    <section className="conversation">
      <header className="conversation-head"><div className="avatar">{activeChat?.name?.[0] || 'E'}</div><div><b>{activeChat?.name || 'Выберите чат'}</b><small>{activeChat?.username || 'ELITIUM'}</small></div></header>
      <div className="messages">{messages.length===0?<div className="empty"><Crown size={30}/><h2>Добро пожаловать в ELITIUM</h2><p>Выберите чат, чтобы начать общение.</p></div>:messages.map(m=><div key={m.id} className={`bubble ${m.mine?'mine':''}`}>{m.body}</div>)}</div>
      <form className="composer" onSubmit={sendMessage}><button type="button" className="icon-btn" onClick={()=>setNotice('Прикрепление фото, видео и файлов будет добавлено следующим этапом.')}><Paperclip/></button><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Написать сообщение..." /><button type="button" className="icon-btn" onClick={()=>setNotice('Стикеры и эмодзи будут добавлены следующим этапом.')}><Smile/></button><button className="send-btn" aria-label="Отправить"><Send/></button></form>
      <Notice text={notice} onClose={()=>setNotice('')}/>
    </section>
  </main>
}

function Brand({compact=false}) { return <div className={`brand ${compact?'compact':''}`}><div className="brand-mark"><Crown/><Send/></div>{!compact&&<><strong>ELITIUM</strong><span>PRIVATE MESSENGER</span></>}</div> }
function Notice({text,onClose}) { if(!text) return null; return <div className="notice">{text}{onClose&&<button onClick={onClose}><X size={14}/></button>}</div> }
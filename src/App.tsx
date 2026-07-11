import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from './supabaseClient'; // KẾT NỐI SUPABASE
import { 
    Home, FileText, PieChart, Settings, Search, Bell, Menu, X, Plus, 
    MoreVertical, Eye, Edit, Trash2, FileDown, UploadCloud, CheckCircle2, 
    AlertCircle, Clock, CheckSquare, ChevronLeft, Calendar, User, FileDigit,
    ArrowDownToLine, ArrowUpRight, LogOut, Users, Shield, Lock, Key
} from 'lucide-react';

const getToday = () => {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
};

const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return '0 VNĐ';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
};

const INITIAL_USERS = [
    { id: '1', username: 'admin', password: '123', fullName: 'Quản trị viên Hệ thống', role: 'admin' }
];

const calculateStatus = (contract) => {
    const totalImport = contract.imports?.reduce((sum, imp) => sum + Number(imp.value), 0) || 0;
    const is100Percent = totalImport >= Number(contract.totalValue) && Number(contract.totalValue) > 0;
    
    if (contract.settlement) {
        return { id: 'settled', label: 'Đã quyết toán', color: 'bg-purple-500/20 text-purple-400 border-purple-500', icon: <CheckCircle2 size={14} className="mr-1"/> };
    }

    if (is100Percent) {
        let cumulative = 0;
        let date100 = null;
        const sortedImports = [...(contract.imports || [])].sort((a,b) => new Date(a.date) - new Date(b.date));
        for (const imp of sortedImports) {
            cumulative += Number(imp.value);
            if (cumulative >= Number(contract.totalValue)) {
                date100 = new Date(imp.date);
                break;
            }
        }
        
        if (date100) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            date100.setHours(0, 0, 0, 0);
            const diffTime = Math.abs(today - date100);
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            return { id: 'overdue', label: `Cần quyết toán (${diffDays} ngày)`, color: 'bg-red-500/20 text-red-400 border-red-500', icon: <AlertCircle size={14} className="mr-1"/> };
        }
    }

    const expiresAt = new Date(contract.expiresAt);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expiresAt.setHours(0, 0, 0, 0);
    
    if (!is100Percent && expiresAt < today) {
        const diffTime = today - expiresAt;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        return { id: 'liquidate', label: `Cần thanh lý (${diffDays} ngày)`, color: 'bg-yellow-500/20 text-yellow-500 border-yellow-500', icon: <AlertCircle size={14} className="mr-1"/> };
    }

    const diffTime = expiresAt - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 30 && diffDays >= 0) {
        return { id: 'expiring', label: `Sắp hết hạn (còn ${diffDays} ngày)`, color: 'bg-orange-500/20 text-orange-400 border-orange-500', icon: <Clock size={14} className="mr-1"/> };
    }

    return { id: 'progressing', label: 'Đang thực hiện', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500', icon: <ArrowUpRight size={14} className="mr-1"/> };
};

export default function ProcurementApp() {
    // Auth State
    const [users, setUsers] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [loginForm, setLoginForm] = useState({ username: '', password: '', error: '' });

    // App State
    const [contracts, setContracts] = useState([]);
    const [view, setView] = useState('dashboard');
    const [activeContractId, setActiveContractId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');

    // Modals
    const [isContractModalOpen, setIsContractModalOpen] = useState(false);
    const [contractForm, setContractForm] = useState(null);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importForm, setImportForm] = useState(null);
    const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
    const [settlementForm, setSettlementForm] = useState(null);
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [userForm, setUserForm] = useState(null);

    // ==========================================
    // TẢI DỮ LIỆU TỪ SUPABASE KHI MỞ WEB
    // ==========================================
    useEffect(() => {
        const loadInitialData = async () => {
            // 1. Tải danh sách người dùng
            const { data: dbUsers } = await supabase.from('users').select('*');
            if (dbUsers && dbUsers.length > 0) {
                setUsers(dbUsers);
            } else {
                await supabase.from('users').insert(INITIAL_USERS);
                setUsers(INITIAL_USERS);
            }

            // 2. Tải danh sách hợp đồng
            const { data: dbContracts } = await supabase.from('contracts').select('*');
            if (dbContracts) setContracts(dbContracts);
        };
        loadInitialData();
    }, []);


    const activeContract = contracts.find(c => c.id === activeContractId);
    
    const canEditContract = useMemo(() => {
        if (!currentUser || !activeContract) return false;
        return currentUser.role === 'admin' || activeContract.createdBy === currentUser.username;
    }, [currentUser, activeContract]);

    const filteredContracts = useMemo(() => {
        return contracts.filter(c => {
            const matchSearch = c.code.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                c.partner.toLowerCase().includes(searchTerm.toLowerCase());
            const status = calculateStatus(c);
            const matchStatus = filterStatus === 'all' || status.id === filterStatus;
            return matchSearch && matchStatus;
        });
    }, [contracts, searchTerm, filterStatus]);

    const stats = useMemo(() => {
        let progressing = 0, expiring = 0, settled = 0, overdue = 0, liquidate = 0;
        contracts.forEach(c => {
            const status = calculateStatus(c).id;
            if (status === 'progressing') progressing++;
            if (status === 'expiring') expiring++;
            if (status === 'settled') settled++;
            if (status === 'overdue') overdue++;
            if (status === 'liquidate') liquidate++;
        });
        return { total: contracts.length, progressing, expiring, settled, overdue, liquidate };
    }, [contracts]);

    const handleLogin = (e) => {
        e.preventDefault();
        const user = users.find(u => u.username === loginForm.username && u.password === loginForm.password);
        if (user) {
            setCurrentUser(user);
            setLoginForm({ username: '', password: '', error: '' });
            setView('dashboard');
        } else {
            setLoginForm({ ...loginForm, error: 'Tên đăng nhập hoặc mật khẩu không đúng!' });
        }
    };

    const handleLogout = () => {
        setCurrentUser(null);
        setView('dashboard');
    };

    // ==========================================
    // CÁC HÀM XỬ LÝ LƯU TRỮ LÊN SUPABASE
    // ==========================================

    const openContractModal = (contract = null) => {
        if (contract) {
            setContractForm(contract);
        } else {
            const today = getToday();
            setContractForm({
                id: Date.now().toString(),
                code: '', name: '', partner: '',
                signedAt: today, expiresAt: today, 
                totalValue: '', inCharge: currentUser.fullName, notes: '',
                imports: [], settlement: null,
                createdBy: currentUser.username
            });
        }
        setIsContractModalOpen(true);
    };

    const saveContract = async () => {
        // Đẩy lên mây
        const { error } = await supabase.from('contracts').upsert(contractForm);
        if (error) { alert('Lỗi: ' + error.message); return; }

        // Cập nhật giao diện
        if (contracts.find(c => c.id === contractForm.id)) {
            setContracts(contracts.map(c => c.id === contractForm.id ? contractForm : c));
        } else {
            setContracts([...contracts, contractForm]);
        }
        setIsContractModalOpen(false);
    };

    const deleteContract = async (id) => {
        const { error } = await supabase.from('contracts').delete().eq('id', id);
        if (!error) {
            setContracts(contracts.filter(c => c.id !== id));
            if (activeContractId === id) setView('list');
        }
    };

    const openImportModal = () => {
        setImportForm({ id: Date.now().toString(), date: getToday(), invoiceNum: '', value: '', file: null, notes: '' });
        setIsImportModalOpen(true);
    };

    const saveImport = async () => {
        const updatedImports = [...(activeContract.imports || []), importForm];
        const { error } = await supabase.from('contracts').update({ imports: updatedImports }).eq('id', activeContractId);
        
        if (!error) {
            const updatedContract = { ...activeContract, imports: updatedImports };
            setContracts(contracts.map(c => c.id === activeContractId ? updatedContract : c));
            setIsImportModalOpen(false);
        }
    };

    const openSettlementModal = () => {
        setSettlementForm({ date: getToday(), file: null, notes: '' });
        setIsSettlementModalOpen(true);
    };

    const saveSettlement = async () => {
        const { error } = await supabase.from('contracts').update({ settlement: settlementForm }).eq('id', activeContractId);
        
        if (!error) {
            const updatedContract = { ...activeContract, settlement: settlementForm };
            setContracts(contracts.map(c => c.id === activeContractId ? updatedContract : c));
            setIsSettlementModalOpen(false);
        }
    };

    const openUserModal = (user = null) => {
        if (user) {
            setUserForm(user);
        } else {
            setUserForm({ id: Date.now().toString(), username: '', password: '', fullName: '', role: 'user' });
        }
        setIsUserModalOpen(true);
    };

    const saveUser = async () => {
        const { error } = await supabase.from('users').upsert(userForm);
        if (error) { alert('Lỗi: ' + error.message); return; }

        if (users.find(u => u.id === userForm.id)) {
            setUsers(users.map(u => u.id === userForm.id ? userForm : u));
        } else {
            setUsers([...users, userForm]);
        }
        setIsUserModalOpen(false);
    };

    const deleteUser = async (id) => {
        const { error } = await supabase.from('users').delete().eq('id', id);
        if (!error) {
            setUsers(users.filter(u => u.id !== id));
        }
    };

    // ==========================================
    // GIAO DIỆN HIỂN THỊ 
    // ==========================================

    if (!currentUser) {
        return (
            <div className="flex h-screen bg-slate-950 items-center justify-center font-sans text-slate-50">
                <div className="w-full max-w-md bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-2xl animate-in zoom-in-95 duration-500">
                    <div className="flex justify-center mb-6">
                        <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                            <Shield size={32} className="text-white" />
                        </div>
                    </div>
                    <h1 className="text-2xl font-bold text-center mb-2">Hệ thống Mua sắm</h1>
                    <p className="text-slate-400 text-center text-sm mb-8">Vui lòng đăng nhập để tiếp tục</p>
                    
                    <form onSubmit={handleLogin} className="space-y-4">
                        {loginForm.error && (
                            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-xl text-center">
                                {loginForm.error}
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium mb-1.5 text-slate-300">Tên đăng nhập</label>
                            <div className="relative">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                <input 
                                    type="text" 
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                                    value={loginForm.username}
                                    onChange={e => setLoginForm({...loginForm, username: e.target.value})}
                                    placeholder="admin"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1.5 text-slate-300">Mật khẩu</label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                <input 
                                    type="password" 
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                                    value={loginForm.password}
                                    onChange={e => setLoginForm({...loginForm, password: e.target.value})}
                                    placeholder="123"
                                />
                            </div>
                        </div>
                        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-blue-500/25 mt-4">
                            Đăng nhập
                        </button>
                    </form>
                    <div className="mt-6 text-center text-xs text-slate-500">
                        *Tài khoản mặc định: <b>admin</b> | Mật khẩu: <b>123</b>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-slate-900 text-slate-50 font-sans">
            {/* Sidebar */}
            <aside className="w-48 bg-slate-950 border-r border-slate-800 flex flex-col">
                <div className="p-4 border-b border-slate-800 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
                        <FileText size={18} className="text-white" />
                    </div>
                    <h1 className="font-bold text-sm leading-tight">Quản lý<br/><span className="text-blue-500">Hợp đồng</span></h1>
                </div>
                <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
                    <button onClick={() => setView('dashboard')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm ${view === 'dashboard' ? 'bg-blue-600/10 text-blue-500 font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                        <PieChart size={18} /> <span>Dashboard</span>
                    </button>
                    <button onClick={() => setView('list')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm ${view === 'list' || view === 'detail' ? 'bg-blue-600/10 text-blue-500 font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                        <FileText size={18} /> <span>Hợp đồng</span>
                    </button>
                    
                    {currentUser.role === 'admin' && (
                        <>
                            <div className="pt-4 pb-2 px-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Hệ thống</div>
                            <button onClick={() => setView('users')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm ${view === 'users' ? 'bg-purple-600/10 text-purple-400 font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                                <Users size={18} /> <span>Tài khoản</span>
                            </button>
                        </>
                    )}
                </nav>
                <div className="p-3 border-t border-slate-800">
                    <div className="px-3 py-2 text-xs text-slate-400 mb-2 truncate">
                        Đang đăng nhập:<br/><b className="text-slate-200 text-sm">{currentUser.fullName}</b>
                    </div>
                    <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm text-red-400 hover:bg-red-500/10 font-medium">
                        <LogOut size={18} /> <span>Đăng xuất</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="h-14 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md flex items-center justify-between px-6">
                    <div className="text-slate-400 text-sm">
                        {new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                    <div className="flex items-center gap-3 text-slate-400">
                        <span className="text-sm border border-slate-700 bg-slate-800 px-3 py-1 rounded-full flex items-center gap-1.5">
                            {currentUser.role === 'admin' ? <Shield size={14} className="text-purple-400"/> : <User size={14} className="text-blue-400"/>}
                            {currentUser.role === 'admin' ? 'Quản trị viên' : 'Nhân viên'}
                        </span>
                    </div>
                </header>

                <div className="flex-1 overflow-auto p-4 md:p-6">
                    {view === 'dashboard' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div>
                                <h2 className="text-2xl font-bold mb-1">Tổng quan</h2>
                                <p className="text-slate-400 text-sm">Báo cáo tình trạng hợp đồng thời gian thực</p>
                            </div>
                            <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3 md:gap-4">
                                <div onClick={() => { setFilterStatus('all'); setView('list'); }} className="bg-slate-800 border border-slate-700 rounded-xl p-4 cursor-pointer hover:bg-slate-750 transition-all hover:-translate-y-1 flex items-center justify-between gap-2">
                                    <div>
                                        <p className="text-slate-400 text-xs mb-0.5 line-clamp-1">Tổng số hợp đồng</p>
                                        <h3 className="text-xl font-bold text-slate-100">{stats.total}</h3>
                                    </div>
                                    <div className="w-9 h-9 bg-blue-500/20 rounded-lg flex items-center justify-center shrink-0 text-blue-500"><FileDigit size={18} /></div>
                                </div>
                                <div onClick={() => { setFilterStatus('progressing'); setView('list'); }} className="bg-slate-800 border border-slate-700 rounded-xl p-4 cursor-pointer hover:bg-slate-750 transition-all hover:-translate-y-1 flex items-center justify-between gap-2">
                                    <div>
                                        <p className="text-slate-400 text-xs mb-0.5 line-clamp-1">Đang thực hiện</p>
                                        <h3 className="text-xl font-bold text-slate-100">{stats.progressing}</h3>
                                    </div>
                                    <div className="w-9 h-9 bg-emerald-500/20 rounded-lg flex items-center justify-center shrink-0 text-emerald-500"><ArrowUpRight size={18} /></div>
                                </div>
                                <div onClick={() => { setFilterStatus('overdue'); setView('list'); }} className="bg-slate-800 border border-slate-700 rounded-xl p-4 cursor-pointer hover:bg-slate-750 transition-all hover:-translate-y-1 flex items-center justify-between gap-2">
                                    <div>
                                        <p className="text-slate-400 text-xs mb-0.5 line-clamp-1">Cần quyết toán</p>
                                        <h3 className="text-xl font-bold text-slate-100">{stats.overdue}</h3>
                                    </div>
                                    <div className="w-9 h-9 bg-red-500/20 rounded-lg flex items-center justify-center shrink-0 text-red-500"><AlertCircle size={18} /></div>
                                </div>
                                <div onClick={() => { setFilterStatus('liquidate'); setView('list'); }} className="bg-slate-800 border border-slate-700 rounded-xl p-4 cursor-pointer hover:bg-slate-750 transition-all hover:-translate-y-1 flex items-center justify-between gap-2">
                                    <div>
                                        <p className="text-slate-400 text-xs mb-0.5 line-clamp-1">Cần thanh lý</p>
                                        <h3 className="text-xl font-bold text-slate-100">{stats.liquidate}</h3>
                                    </div>
                                    <div className="w-9 h-9 bg-yellow-500/20 rounded-lg flex items-center justify-center shrink-0 text-yellow-500"><AlertCircle size={18} /></div>
                                </div>
                                <div onClick={() => { setFilterStatus('expiring'); setView('list'); }} className="bg-slate-800 border border-slate-700 rounded-xl p-4 cursor-pointer hover:bg-slate-750 transition-all hover:-translate-y-1 flex items-center justify-between gap-2">
                                    <div>
                                        <p className="text-slate-400 text-xs mb-0.5 line-clamp-1">Sắp hết hạn</p>
                                        <h3 className="text-xl font-bold text-slate-100">{stats.expiring}</h3>
                                    </div>
                                    <div className="w-9 h-9 bg-orange-500/20 rounded-lg flex items-center justify-center shrink-0 text-orange-500"><Clock size={18} /></div>
                                </div>
                                <div onClick={() => { setFilterStatus('settled'); setView('list'); }} className="bg-slate-800 border border-slate-700 rounded-xl p-4 cursor-pointer hover:bg-slate-750 transition-all hover:-translate-y-1 flex items-center justify-between gap-2">
                                    <div>
                                        <p className="text-slate-400 text-xs mb-0.5 line-clamp-1">Đã quyết toán</p>
                                        <h3 className="text-xl font-bold text-slate-100">{stats.settled}</h3>
                                    </div>
                                    <div className="w-9 h-9 bg-purple-500/20 rounded-lg flex items-center justify-center shrink-0 text-purple-500"><CheckCircle2 size={18} /></div>
                                </div>
                            </div>
                        </div>
                    )}

                    {view === 'list' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 h-full flex flex-col">
                            <div className="flex items-center justify-between shrink-0">
                                <div>
                                    <h2 className="text-2xl font-bold mb-1">Danh sách hợp đồng</h2>
                                </div>
                                <button onClick={() => openContractModal()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors">
                                    <Plus size={16} /> Thêm hợp đồng
                                </button>
                            </div>

                            <div className="bg-slate-800 border border-slate-700 rounded-2xl flex flex-col overflow-hidden">
                                <div className="p-3 border-b border-slate-700 flex gap-3 shrink-0">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                        <input 
                                            type="text" 
                                            placeholder="Tìm kiếm số HĐ, tên HĐ, đối tác..." 
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-blue-500 transition-colors"
                                        />
                                    </div>
                                    <select 
                                        value={filterStatus}
                                        onChange={(e) => setFilterStatus(e.target.value)}
                                        className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500 min-w-[150px]"
                                    >
                                        <option value="all">Tất cả trạng thái</option>
                                        <option value="progressing">Đang thực hiện</option>
                                        <option value="expiring">Sắp hết hạn</option>
                                        <option value="liquidate">Cần thanh lý</option>
                                        <option value="overdue">Cần quyết toán</option>
                                        <option value="settled">Đã quyết toán</option>
                                    </select>
                                </div>
                                <div className="overflow-auto flex-1">
                                    <table className="w-full text-[12px] text-left table-fixed">
                                        <thead className="text-[11px] text-slate-400 uppercase bg-slate-900/80 sticky top-0 backdrop-blur-sm z-10">
                                            <tr>
                                                <th className="px-3 py-2.5 font-medium w-10">STT</th>
                                                <th className="px-3 py-2.5 font-medium w-28">Số HĐ</th>
                                                <th className="px-3 py-2.5 font-medium pr-4">Tên HĐ & Đối tác</th>
                                                <th className="px-3 py-2.5 font-medium w-40">Tiến độ nhập</th>
                                                <th className="px-3 py-2.5 font-medium w-40">Trạng thái</th>
                                                <th className="px-3 py-2.5 font-medium text-center w-12">Thao tác</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-700/50">
                                            {filteredContracts.map((contract, index) => {
                                                const totalImport = contract.imports?.reduce((sum, imp) => sum + Number(imp.value), 0) || 0;
                                                const remaining = Math.max(0, Number(contract.totalValue) - totalImport);
                                                const status = calculateStatus(contract);
                                                const percent = Number(contract.totalValue) > 0 ? Math.min(100, (totalImport / Number(contract.totalValue)) * 100) : 0;
                                                
                                                return (
                                                    <tr key={contract.id} className="hover:bg-slate-700/30 transition-colors">
                                                        <td className="px-3 py-2.5 text-slate-500 truncate">{index + 1}</td>
                                                        <td className="px-3 py-2.5 font-mono text-blue-400 truncate" title={contract.code}>{contract.code}</td>
                                                        <td className="px-3 py-2.5 pr-4 truncate">
                                                            <div className="font-medium text-slate-200 truncate" title={contract.name}>{contract.name}</div>
                                                            <div className="text-[11px] text-slate-500 mt-0.5 truncate" title={contract.partner}>{contract.partner}</div>
                                                        </td>
                                                        <td className="px-3 py-2.5">
                                                            <div className="flex justify-between items-end text-[10px] mb-1">
                                                                <span className="text-emerald-400 font-medium truncate" title={`Đã nhập: ${formatCurrency(totalImport)}`}>{formatCurrency(totalImport)}</span>
                                                                <span className="text-slate-400 font-medium ml-2 truncate" title={`Tổng giá trị HĐ: ${formatCurrency(contract.totalValue)}`}>{formatCurrency(contract.totalValue)}</span>
                                                            </div>
                                                            <div className="w-full bg-slate-700/80 rounded-full h-1 overflow-hidden">
                                                                <div className={`h-full rounded-full transition-all duration-500 ${percent >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${percent}%` }}></div>
                                                            </div>
                                                            <div className="text-[10px] text-right text-orange-400/90 mt-1 truncate" title={`Còn lại: ${formatCurrency(remaining)}`}>
                                                                Còn lại: {formatCurrency(remaining)}
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-2.5 truncate">
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${status.color}`}>
                                                                {status.icon} {status.label}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2.5 text-center">
                                                            <button onClick={() => { setActiveContractId(contract.id); setView('detail'); }} className="text-slate-400 hover:text-blue-400 p-1.5 transition-colors bg-slate-900 rounded-lg border border-slate-700 hover:border-blue-500/30">
                                                                <Eye size={14} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {filteredContracts.length === 0 && (
                                                <tr>
                                                    <td colSpan="10" className="px-3 py-10 text-center text-slate-500 text-sm">
                                                        Không tìm thấy hợp đồng nào
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {view === 'detail' && activeContract && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <button onClick={() => setView('list')} className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                                        <ChevronLeft size={18} />
                                    </button>
                                    <div>
                                        <h2 className="text-xl font-bold mb-0.5">{activeContract.name}</h2>
                                        <div className="flex items-center gap-2 text-xs text-slate-400">
                                            <span className="font-mono text-blue-400">{activeContract.code}</span>
                                            <span>•</span>
                                            <span>{activeContract.partner}</span>
                                            <span>•</span>
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${calculateStatus(activeContract).color}`}>
                                                {calculateStatus(activeContract).label}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                {canEditContract && (
                                    <div className="flex gap-2">
                                        <button onClick={() => openContractModal(activeContract)} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5">
                                            <Edit size={14}/> Sửa
                                        </button>
                                        <button onClick={() => deleteContract(activeContract.id)} className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5">
                                            <Trash2 size={14}/> Xóa
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                                <div className="lg:col-span-2 space-y-5">
                                    {/* Imports Section */}
                                    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-base font-semibold">Lịch sử đợt nhập</h3>
                                            {canEditContract && (
                                                <button onClick={openImportModal} className="text-xs bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors">
                                                    <Plus size={14} /> Thêm đợt nhập
                                                </button>
                                            )}
                                        </div>
                                        <table className="w-full text-[12px] text-left">
                                            <thead className="text-[11px] text-slate-400 uppercase border-b border-slate-700">
                                                <tr>
                                                    <th className="py-2.5 font-medium">Ngày nhập</th>
                                                    <th className="py-2.5 font-medium">Số hóa đơn</th>
                                                    <th className="py-2.5 font-medium text-right">Giá trị</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-700/50">
                                                {activeContract.imports?.map((imp, idx) => (
                                                    <tr key={idx}>
                                                        <td className="py-3 text-slate-300">{new Date(imp.date).toLocaleDateString('vi-VN')}</td>
                                                        <td className="py-3 font-mono text-slate-400">{imp.invoiceNum}</td>
                                                        <td className="py-3 text-right font-medium text-emerald-400">{formatCurrency(imp.value)}</td>
                                                    </tr>
                                                ))}
                                                {(!activeContract.imports || activeContract.imports.length === 0) && (
                                                    <tr>
                                                        <td colSpan="3" className="py-8 text-center text-slate-500">Chưa có đợt nhập nào</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Settlement Section */}
                                    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-base font-semibold flex items-center gap-2"><CheckSquare size={16} className="text-purple-500" /> Hồ sơ quyết toán</h3>
                                            {(!activeContract.settlement && canEditContract) && (
                                                <button onClick={openSettlementModal} className="text-xs bg-purple-600 hover:bg-purple-700 px-3 py-1.5 rounded-lg font-medium transition-colors text-white">
                                                    Giao hồ sơ
                                                </button>
                                            )}
                                        </div>
                                        {activeContract.settlement ? (
                                            <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 flex justify-between items-center">
                                                <div>
                                                    <div className="font-medium text-purple-400 text-sm mb-0.5">Đã giao hồ sơ quyết toán</div>
                                                    <div className="text-xs text-slate-400">Ngày giao: {new Date(activeContract.settlement.date).toLocaleDateString('vi-VN')}</div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-center py-6 text-slate-500 bg-slate-900/50 rounded-xl border border-dashed border-slate-700 text-sm">
                                                Hợp đồng chưa được quyết toán
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Summary Sidebar */}
                                <div className="space-y-5">
                                    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
                                        <h3 className="text-base font-semibold mb-4">Tổng hợp tài chính</h3>
                                        <div className="space-y-3">
                                            <div>
                                                <div className="text-xs text-slate-400 mb-0.5">Giá trị hợp đồng</div>
                                                <div className="text-lg font-bold text-slate-200">{formatCurrency(activeContract.totalValue)}</div>
                                            </div>
                                            <div className="pt-3 border-t border-slate-700">
                                                <div className="text-xs text-slate-400 mb-0.5">Đã nhập</div>
                                                <div className="text-lg font-bold text-emerald-400">
                                                    {formatCurrency(activeContract.imports?.reduce((sum, imp) => sum + Number(imp.value), 0) || 0)}
                                                </div>
                                            </div>
                                            <div className="pt-3 border-t border-slate-700">
                                                <div className="text-xs text-slate-400 mb-0.5">Còn lại</div>
                                                <div className="text-lg font-bold text-orange-400">
                                                    {formatCurrency(Math.max(0, Number(activeContract.totalValue) - (activeContract.imports?.reduce((sum, imp) => sum + Number(imp.value), 0) || 0)))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
                                        <h3 className="text-base font-semibold mb-3">Thông tin chung</h3>
                                        <div className="space-y-2 text-[13px]">
                                            <div className="flex justify-between border-b border-slate-700 pb-1.5">
                                                <span className="text-slate-400">Tạo bởi</span>
                                                <span className="font-medium text-right text-blue-400">{activeContract.createdBy}</span>
                                            </div>
                                            <div className="flex justify-between border-b border-slate-700 pb-1.5">
                                                <span className="text-slate-400">Người phụ trách</span>
                                                <span className="font-medium text-right">{activeContract.inCharge || '---'}</span>
                                            </div>
                                            <div className="flex justify-between border-b border-slate-700 pb-1.5">
                                                <span className="text-slate-400">Ngày ký</span>
                                                <span className="font-medium text-right">{new Date(activeContract.signedAt).toLocaleDateString('vi-VN')}</span>
                                            </div>
                                            <div className="flex justify-between border-b border-slate-700 pb-1.5">
                                                <span className="text-slate-400">Ngày hết hạn</span>
                                                <span className="font-medium text-right">{new Date(activeContract.expiresAt).toLocaleDateString('vi-VN')}</span>
                                            </div>
                                            {activeContract.notes && (
                                                <div className="pt-1">
                                                    <span className="text-slate-400 block mb-0.5 text-xs">Ghi chú:</span>
                                                    <span className="text-slate-300 text-xs">{activeContract.notes}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {view === 'users' && currentUser.role === 'admin' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-2xl font-bold mb-1">Quản lý Tài khoản</h2>
                                    <p className="text-slate-400 text-sm">Phân quyền và quản lý người dùng hệ thống</p>
                                </div>
                                <button onClick={() => openUserModal()} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors">
                                    <Plus size={16} /> Thêm tài khoản
                                </button>
                            </div>

                            <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="text-xs text-slate-400 uppercase bg-slate-900/50">
                                            <tr>
                                                <th className="px-4 py-3 font-medium">Tên đăng nhập</th>
                                                <th className="px-4 py-3 font-medium">Họ và tên</th>
                                                <th className="px-4 py-3 font-medium">Quyền hạn</th>
                                                <th className="px-4 py-3 font-medium text-right">Thao tác</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-700/50">
                                            {users.map((user) => (
                                                <tr key={user.id} className="hover:bg-slate-700/30 transition-colors">
                                                    <td className="px-4 py-3 font-medium text-slate-200">{user.username}</td>
                                                    <td className="px-4 py-3 text-slate-300">{user.fullName}</td>
                                                    <td className="px-4 py-3">
                                                        {user.role === 'admin' ? (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-purple-500/20 text-purple-400 border-purple-500">
                                                                <Shield size={12} className="mr-1"/> Quản trị viên
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-blue-500/20 text-blue-400 border-blue-500">
                                                                <User size={12} className="mr-1"/> Nhân viên
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <button onClick={() => openUserModal(user)} className="text-slate-400 hover:text-blue-400 p-1.5 transition-colors">
                                                            <Edit size={16} />
                                                        </button>
                                                        {user.username !== 'admin' && ( // Không cho xóa admin gốc
                                                            <button onClick={() => deleteUser(user.id)} className="text-slate-400 hover:text-red-400 p-1.5 transition-colors ml-1">
                                                                <Trash2 size={16} />
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* CONTRACT MODAL */}
            {isContractModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                            <h3 className="text-lg font-bold">{contractForm.id.length > 13 ? 'Thêm hợp đồng mới' : 'Chỉnh sửa hợp đồng'}</h3>
                            <button onClick={() => setIsContractModalOpen(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium mb-1">Số hợp đồng *</label>
                                    <input type="text" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" value={contractForm.code} onChange={e => setContractForm({...contractForm, code: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium mb-1">Đối tác *</label>
                                    <input type="text" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" value={contractForm.partner} onChange={e => setContractForm({...contractForm, partner: e.target.value})} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1">Tên hợp đồng *</label>
                                <input type="text" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" value={contractForm.name} onChange={e => setContractForm({...contractForm, name: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium mb-1">Ngày ký</label>
                                    <input type="date" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" value={contractForm.signedAt} onChange={e => setContractForm({...contractForm, signedAt: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium mb-1">Ngày hết hạn</label>
                                    <input type="date" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" value={contractForm.expiresAt} onChange={e => setContractForm({...contractForm, expiresAt: e.target.value})} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium mb-1">Giá trị hợp đồng (VNĐ) *</label>
                                    <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" value={contractForm.totalValue} onChange={e => setContractForm({...contractForm, totalValue: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium mb-1">Người phụ trách</label>
                                    <input type="text" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" value={contractForm.inCharge} onChange={e => setContractForm({...contractForm, inCharge: e.target.value})} />
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-800 flex justify-end gap-3 bg-slate-800/50">
                            <button onClick={() => setIsContractModalOpen(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-700 transition">Hủy</button>
                            <button onClick={saveContract} className="px-4 py-2 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition">Lưu Hợp Đồng</button>
                        </div>
                    </div>
                </div>
            )}

            {/* IMPORT MODAL */}
            {isImportModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                            <h3 className="text-base font-bold">Thêm đợt nhập vật tư</h3>
                            <button onClick={() => setIsImportModalOpen(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="block text-xs font-medium mb-1">Ngày nhập</label>
                                <input type="date" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" value={importForm.date} onChange={e => setImportForm({...importForm, date: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1">Số hóa đơn</label>
                                <input type="text" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" value={importForm.invoiceNum} onChange={e => setImportForm({...importForm, invoiceNum: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1">Giá trị nhập (VNĐ) *</label>
                                <div className="relative">
                                    <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 pr-14 text-sm focus:outline-none focus:border-blue-500" value={importForm.value} onChange={e => setImportForm({...importForm, value: e.target.value})} />
                                    <button 
                                        onClick={() => setImportForm({...importForm, value: activeContract.totalValue})}
                                        className="absolute right-1 top-1/2 -translate-y-1/2 px-2 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 text-[10px] font-bold rounded-lg transition-colors"
                                        title="Điền tổng giá trị hợp đồng"
                                    >
                                        MAX
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-800 flex justify-end gap-2 bg-slate-800/50">
                            <button onClick={() => setIsImportModalOpen(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-700 transition">Hủy</button>
                            <button onClick={saveImport} className="px-4 py-2 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition">Lưu Đợt Nhập</button>
                        </div>
                    </div>
                </div>
            )}

            {/* SETTLEMENT MODAL */}
            {isSettlementModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-purple-900/30 flex justify-between items-center bg-purple-900/10">
                            <h3 className="text-base font-bold text-purple-400">Giao hồ sơ quyết toán</h3>
                            <button onClick={() => setIsSettlementModalOpen(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div className="p-3 bg-purple-500/10 text-purple-200 text-xs rounded-xl border border-purple-500/20 leading-relaxed">
                                Sau khi giao hồ sơ, trạng thái hợp đồng sẽ chuyển thành <strong>Đã quyết toán</strong> và dừng mọi cảnh báo.
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1">Ngày giao hồ sơ</label>
                                <input type="date" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500" value={settlementForm.date} onChange={e => setSettlementForm({...settlementForm, date: e.target.value})} />
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-800 flex justify-end gap-2 bg-slate-800/50">
                            <button onClick={() => setIsSettlementModalOpen(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-700 transition">Hủy</button>
                            <button onClick={saveSettlement} className="px-4 py-2 rounded-xl text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white transition flex items-center gap-2">
                                <CheckCircle2 size={16} /> Chốt Quyết Toán
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* USER MODAL */}
            {isUserModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                            <h3 className="text-base font-bold">{userForm.id.length > 13 ? 'Thêm tài khoản' : 'Sửa tài khoản'}</h3>
                            <button onClick={() => setIsUserModalOpen(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="block text-xs font-medium mb-1">Tên đăng nhập *</label>
                                <input type="text" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500" disabled={userForm.username === 'admin'} value={userForm.username} onChange={e => setUserForm({...userForm, username: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1">Mật khẩu *</label>
                                <input type="text" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500" value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1">Họ và tên</label>
                                <input type="text" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500" value={userForm.fullName} onChange={e => setUserForm({...userForm, fullName: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1">Quyền hạn</label>
                                <select 
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500" 
                                    value={userForm.role} 
                                    disabled={userForm.username === 'admin'}
                                    onChange={e => setUserForm({...userForm, role: e.target.value})}
                                >
                                    <option value="user">Nhân viên (Chỉ thao tác HĐ mình tạo)</option>
                                    <option value="admin">Quản trị viên (Toàn quyền)</option>
                                </select>
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-800 flex justify-end gap-2 bg-slate-800/50">
                            <button onClick={() => setIsUserModalOpen(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-700 transition">Hủy</button>
                            <button onClick={saveUser} className="px-4 py-2 rounded-xl text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white transition">Lưu Tài Khoản</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
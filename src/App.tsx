import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from './supabaseClient'; 
import { 
    Home, FileText, PieChart, Settings, Search, Bell, Menu, X, Plus, 
    MoreVertical, Eye, Edit, Trash2, FileDown, UploadCloud, CheckCircle2, 
    AlertCircle, Clock, CheckSquare, ChevronLeft, Calendar, User, FileDigit,
    ArrowDownToLine, ArrowUpRight, LogOut, Users, Shield, Lock, Key, Package,
    ChevronDown, ChevronRight, Briefcase, CheckCircle, XCircle, MessageSquare
} from 'lucide-react';

const getToday = () => {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
};

const formatDisplayDate = (dateString) => {
    if (!dateString) return '---';
    const d = new Date(dateString);
    const day = String(d.getDate()).padStart(2, '0');
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    return `${day} tháng ${month}, ${year}`;
};

const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return '0 đ';
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

// CẬP NHẬT TRẠNG THÁI CÔNG VIỆC
const getTaskStatus = (task) => {
    if (task.status === 'completed') {
        return { label: 'Đã hoàn thành', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
    }
    if (task.status === 'waiting') {
        return { label: 'Chờ sếp duyệt', color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' };
    }

    const today = new Date();
    today.setHours(0,0,0,0);
    const due = new Date(task.dueDate);
    due.setHours(0,0,0,0);
    
    if (due < today) {
        const diffDays = Math.floor((today - due) / (1000 * 60 * 60 * 24));
        return { label: `Quá hạn (${diffDays} ngày)`, color: 'text-red-400 bg-red-500/10 border-red-500/30' };
    }
    return { label: 'Đang thực hiện', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' };
};

export default function ProcurementApp() {
    // Auth State
    const [users, setUsers] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [loginForm, setLoginForm] = useState({ username: '', password: '', error: '' });

    // App State
    const [contracts, setContracts] = useState([]);
    const [tasks, setTasks] = useState([]); 
    const [notifications, setNotifications] = useState([]); // STATE THÔNG BÁO MỚI
    const [view, setView] = useState('dashboard');
    const [activeContractId, setActiveContractId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const [importStartDate, setImportStartDate] = useState('');
    const [importEndDate, setImportEndDate] = useState('');

    const [isMaterialMenuOpen, setIsMaterialMenuOpen] = useState(true);
    const [isNotifOpen, setIsNotifOpen] = useState(false); // Đóng/mở bảng thông báo

    // Modals
    const [isContractModalOpen, setIsContractModalOpen] = useState(false);
    const [contractForm, setContractForm] = useState(null);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importForm, setImportForm] = useState(null);
    const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
    const [settlementForm, setSettlementForm] = useState(null);
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [userForm, setUserForm] = useState(null);
    const [isChangePwdModalOpen, setIsChangePwdModalOpen] = useState(false);
    const [changePwdForm, setChangePwdForm] = useState({ oldPwd: '', newPwd: '', confirmPwd: '', error: '', success: '' });
    
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [taskForm, setTaskForm] = useState(null);

    // STATE CHO MODAL HOÀN THÀNH CÔNG VIỆC
    const [isCompleteTaskModalOpen, setIsCompleteTaskModalOpen] = useState(false);
    const [completeTaskForm, setCompleteTaskForm] = useState({ id: '', note: '' });

    // TẢI DỮ LIỆU
    useEffect(() => {
        const loadInitialData = async () => {
            const { data: dbUsers } = await supabase.from('users').select('*');
            if (dbUsers && dbUsers.length > 0) {
                setUsers(dbUsers);
            } else {
                await supabase.from('users').insert(INITIAL_USERS);
                setUsers(INITIAL_USERS);
            }
            
            const { data: dbContracts } = await supabase.from('contracts').select('*');
            if (dbContracts) setContracts(dbContracts);

            const { data: dbTasks } = await supabase.from('tasks').select('*');
            if (dbTasks) setTasks(dbTasks);

            const { data: dbNotifs } = await supabase.from('notifications').select('*');
            if (dbNotifs) setNotifications(dbNotifs);
        };
        loadInitialData();
    }, []);

    const activeContract = contracts.find(c => c.id === activeContractId);
    
    const canEditContract = useMemo(() => {
        if (!currentUser || !activeContract) return false;
        return currentUser.role === 'admin' || activeContract.createdBy === currentUser.username;
    }, [currentUser, activeContract]);

    const visibleContracts = useMemo(() => {
        if (!currentUser) return [];
        if (currentUser.role === 'admin') return contracts;
        return contracts.filter(c => c.createdBy === currentUser.username);
    }, [contracts, currentUser]);

    // BỘ LỌC CÔNG VIỆC
    const visibleTasks = useMemo(() => {
        if (!currentUser) return [];
        let filtered = tasks;
        if (currentUser.role !== 'admin') {
            filtered = tasks.filter(t => t.assignee === currentUser.username || t.createdBy === currentUser.username);
        }
        return filtered.sort((a, b) => {
            if (a.status !== b.status) {
                if (a.status === 'waiting') return -1;
                if (b.status === 'waiting') return 1;
                if (a.status === 'completed') return 1;
                return -1;
            }
            return new Date(b.dueDate) - new Date(a.dueDate);
        });
    }, [tasks, currentUser]);

    // BỘ LỌC THÔNG BÁO CHO USER HIỆN TẠI
    const myNotifications = useMemo(() => {
        if (!currentUser) return [];
        return notifications
            .filter(n => n.userId === currentUser.username)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }, [notifications, currentUser]);

    const unreadNotifCount = myNotifications.filter(n => !n.isRead).length;

    const filteredContracts = useMemo(() => {
        return visibleContracts.filter(c => {
            const matchSearch = c.code.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                c.partner.toLowerCase().includes(searchTerm.toLowerCase());
            
            const status = calculateStatus(c);
            const matchStatus = filterStatus === 'all' || status.id === filterStatus;
            
            let matchDate = true;
            if (startDate || endDate) {
                const contractDate = new Date(c.signedAt);
                contractDate.setHours(0,0,0,0);
                
                if (startDate) {
                    const start = new Date(startDate);
                    start.setHours(0,0,0,0);
                    if (contractDate < start) matchDate = false;
                }
                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23,59,59,999);
                    if (contractDate > end) matchDate = false;
                }
            }

            return matchSearch && matchStatus && matchDate;
        });
    }, [visibleContracts, searchTerm, filterStatus, startDate, endDate]);

    const totals = useMemo(() => {
        let count = 0;
        let importCount = 0;
        let totalValue = 0;
        let importedValue = 0;

        filteredContracts.forEach(c => {
            count++;
            importCount += (c.imports?.length || 0);
            totalValue += (Number(c.totalValue) || 0);
            importedValue += (c.imports?.reduce((sum, imp) => sum + Number(imp.value), 0) || 0);
        });

        return { count, importCount, totalValue, importedValue };
    }, [filteredContracts]);

    const stats = useMemo(() => {
        let progressing = 0, expiring = 0, settled = 0, overdue = 0, liquidate = 0;
        let totalImportsCount = 0; 
        
        visibleContracts.forEach(c => {
            totalImportsCount += (c.imports?.length || 0);
            const status = calculateStatus(c).id;
            if (status === 'progressing') progressing++;
            if (status === 'expiring') expiring++;
            if (status === 'settled') settled++;
            if (status === 'overdue') overdue++;
            if (status === 'liquidate') liquidate++;
        });
        return { total: visibleContracts.length, progressing, expiring, settled, overdue, liquidate, totalImportsCount };
    }, [visibleContracts]);

    const filteredImports = useMemo(() => {
        let allImports = [];
        visibleContracts.forEach(contract => {
            if (contract.imports && contract.imports.length > 0) {
                contract.imports.forEach(imp => {
                    allImports.push({
                        ...imp,
                        contractId: contract.id,
                        contractCode: contract.code,
                        contractName: contract.name
                    });
                });
            }
        });

        if (importStartDate || importEndDate) {
            allImports = allImports.filter(imp => {
                const d = new Date(imp.date);
                d.setHours(0,0,0,0);
                let match = true;
                if (importStartDate) {
                    const start = new Date(importStartDate);
                    start.setHours(0,0,0,0);
                    if (d < start) match = false;
                }
                if (importEndDate) {
                    const end = new Date(importEndDate);
                    end.setHours(23,59,59,999);
                    if (d > end) match = false;
                }
                return match;
            });
        }

        return allImports.sort((a, b) => new Date(b.date) - new Date(a.date));
    }, [visibleContracts, importStartDate, importEndDate]);

    const importsTotals = useMemo(() => {
        const count = filteredImports.length;
        const totalValue = filteredImports.reduce((sum, imp) => sum + Number(imp.value), 0);
        return { count, totalValue };
    }, [filteredImports]);

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

    const handleSavePassword = async () => {
        if (changePwdForm.oldPwd !== currentUser.password) {
            setChangePwdForm(prev => ({...prev, error: 'Mật khẩu hiện tại không đúng!', success: ''}));
            return;
        }
        if (changePwdForm.newPwd !== changePwdForm.confirmPwd) {
            setChangePwdForm(prev => ({...prev, error: 'Mật khẩu mới không khớp!', success: ''}));
            return;
        }
        if (changePwdForm.newPwd.trim() === '') {
            setChangePwdForm(prev => ({...prev, error: 'Mật khẩu không được để trống!', success: ''}));
            return;
        }

        const { error } = await supabase.from('users').update({ password: changePwdForm.newPwd }).eq('id', currentUser.id);
        
        if (!error) {
            const updatedUser = { ...currentUser, password: changePwdForm.newPwd };
            setCurrentUser(updatedUser);
            setUsers(users.map(u => u.id === currentUser.id ? updatedUser : u));
            setChangePwdForm(prev => ({...prev, error: '', success: 'Đổi mật khẩu thành công!'}));
            setTimeout(() => {
                setIsChangePwdModalOpen(false);
                setChangePwdForm({ oldPwd: '', newPwd: '', confirmPwd: '', error: '', success: '' });
            }, 1500);
        } else {
            setChangePwdForm(prev => ({...prev, error: 'Lỗi hệ thống: ' + error.message, success: ''}));
        }
    };

    // LOGIC THÔNG BÁO
    const sendNotification = async (userId, message) => {
        const newNotif = {
            id: Date.now().toString(),
            userId: userId,
            message: message,
            isRead: false,
            createdAt: new Date().toISOString()
        };
        await supabase.from('notifications').insert(newNotif);
        setNotifications(prev => [...prev, newNotif]);
    };

    const markNotifAsRead = async (notifId) => {
        await supabase.from('notifications').update({ isRead: true }).eq('id', notifId);
        setNotifications(notifications.map(n => n.id === notifId ? { ...n, isRead: true } : n));
    };

    // LOGIC CÔNG VIỆC
    const openTaskModal = (task = null) => {
        if (task) {
            setTaskForm(task);
        } else {
            setTaskForm({
                id: Date.now().toString(),
                description: '',
                assignee: users.length > 0 ? users[0].username : '', 
                dueDate: getToday(),
                status: 'pending',
                completionNote: '',
                createdBy: currentUser.username
            });
        }
        setIsTaskModalOpen(true);
    };

    const saveTask = async () => {
        if (!taskForm.description.trim()) {
            alert('Vui lòng nhập nội dung công việc!');
            return;
        }
        const isNew = !tasks.find(t => t.id === taskForm.id);
        
        const { error } = await supabase.from('tasks').upsert(taskForm);
        if (error) { alert('Lỗi (Hãy chắc chắn bạn đã chạy lệnh SQL thêm bảng/cột trên Supabase): ' + error.message); return; }

        if (isNew) {
            setTasks([...tasks, taskForm]);
            if (taskForm.assignee !== currentUser.username) {
                sendNotification(taskForm.assignee, `Bạn được giao công việc mới: "${taskForm.description}"`);
            }
        } else {
            setTasks(tasks.map(t => t.id === taskForm.id ? taskForm : t));
        }
        setIsTaskModalOpen(false);
    };

    const deleteTask = async (id) => {
        const { error } = await supabase.from('tasks').delete().eq('id', id);
        if (!error) setTasks(tasks.filter(t => t.id !== id));
    };

    // Nhân viên báo cáo hoàn thành (Gửi đi chờ duyệt)
    const submitTaskCompletion = async () => {
        if (!completeTaskForm.note.trim()) {
            alert('Vui lòng nhập ghi chú hoặc kết quả hoàn thành!');
            return;
        }

        const task = tasks.find(t => t.id === completeTaskForm.id);
        const { error } = await supabase.from('tasks').update({ 
            status: 'waiting', 
            completionNote: completeTaskForm.note 
        }).eq('id', task.id);

        if (!error) {
            setTasks(tasks.map(t => t.id === task.id ? { ...t, status: 'waiting', completionNote: completeTaskForm.note } : t));
            sendNotification(task.createdBy, `Nhân viên ${currentUser.fullName} đã báo cáo hoàn thành việc: "${task.description}" - Vui lòng duyệt!`);
            setIsCompleteTaskModalOpen(false);
        }
    };

    // Người giao việc DUYỆT
    const approveTask = async (task) => {
        const { error } = await supabase.from('tasks').update({ status: 'completed' }).eq('id', task.id);
        if (!error) {
            setTasks(tasks.map(t => t.id === task.id ? { ...t, status: 'completed' } : t));
            sendNotification(task.assignee, `Công việc "${task.description}" của bạn ĐÃ ĐƯỢC DUYỆT!`);
        }
    };

    // Người giao việc TỪ CHỐI
    const rejectTask = async (task) => {
        const { error } = await supabase.from('tasks').update({ status: 'pending', completionNote: '' }).eq('id', task.id);
        if (!error) {
            setTasks(tasks.map(t => t.id === task.id ? { ...t, status: 'pending', completionNote: '' } : t));
            sendNotification(task.assignee, `Sếp đã TỪ CHỐI báo cáo việc "${task.description}". Yêu cầu làm lại!`);
        }
    };


    // LOGIC HỢP ĐỒNG
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
        const { error } = await supabase.from('contracts').upsert(contractForm);
        if (error) { alert('Lỗi: ' + error.message); return; }

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

    // =========================================================================
    // RENDER UI
    // =========================================================================

    if (!currentUser) {
        return (
            <div className="flex h-screen bg-slate-950 items-center justify-center font-sans text-slate-50">
                <div className="w-full max-w-md bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-2xl animate-in zoom-in-95 duration-500">
                    <div className="flex justify-center mb-6">
                        <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                            <Shield size={32} className="text-white" />
                        </div>
                    </div>
                    <h1 className="text-2xl font-bold text-center mb-2">Quản Lý Vật Tư</h1>
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
                    <h1 className="font-bold text-sm leading-tight">Quản lý<br/><span className="text-blue-500">Vật tư</span></h1>
                </div>
                
                <nav className="flex-1 p-3 space-y-2 overflow-y-auto">
                    <div>
                        <button 
                            onClick={() => setIsMaterialMenuOpen(!isMaterialMenuOpen)} 
                            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all text-sm text-slate-200 hover:bg-slate-800 font-medium"
                        >
                            <div className="flex items-center gap-3">
                                <Package size={18} className="text-blue-500" /> 
                                <span>Quản lý Vật tư</span>
                            </div>
                            {isMaterialMenuOpen ? <ChevronDown size={16} className="text-slate-500"/> : <ChevronRight size={16} className="text-slate-500"/>}
                        </button>

                        {isMaterialMenuOpen && (
                            <div className="mt-1 space-y-1 relative">
                                <div className="absolute left-[21px] top-0 bottom-2 w-px bg-slate-800"></div>
                                <button onClick={() => setView('dashboard')} className={`w-full flex items-center gap-3 pl-11 pr-3 py-2.5 rounded-xl transition-all text-sm ${view === 'dashboard' ? 'bg-blue-600/10 text-blue-500 font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                                    <PieChart size={16} /> <span>Dashboard</span>
                                </button>
                                <button onClick={() => setView('list')} className={`w-full flex items-center gap-3 pl-11 pr-3 py-2.5 rounded-xl transition-all text-sm ${view === 'list' || view === 'detail' || view === 'imports_report' ? 'bg-blue-600/10 text-blue-500 font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                                    <FileText size={16} /> <span>Hợp đồng</span>
                                </button>
                            </div>
                        )}
                    </div>

                    <button onClick={() => setView('tasks')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm ${view === 'tasks' ? 'bg-blue-600/10 text-blue-500 font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                        <Briefcase size={18} className={view === 'tasks' ? 'text-blue-500' : 'text-slate-400'} /> 
                        <span>Công việc</span>
                        {/* Hiện số lượng việc cần làm hoặc chờ duyệt */}
                        {visibleTasks.filter(t => (t.assignee === currentUser.username && t.status === 'pending') || (t.createdBy === currentUser.username && t.status === 'waiting')).length > 0 && (
                            <span className="ml-auto bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                                {visibleTasks.filter(t => (t.assignee === currentUser.username && t.status === 'pending') || (t.createdBy === currentUser.username && t.status === 'waiting')).length}
                            </span>
                        )}
                    </button>
                    
                    {currentUser.role === 'admin' && (
                        <div className="pt-2">
                            <div className="pb-1 px-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Hệ thống</div>
                            <button onClick={() => setView('users')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm ${view === 'users' ? 'bg-purple-600/10 text-purple-400 font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                                <Users size={18} /> <span>Tài khoản</span>
                            </button>
                        </div>
                    )}
                </nav>

                <div className="p-3 border-t border-slate-800 space-y-1.5">
                    <div className="px-3 py-2 text-xs text-slate-400 mb-2 truncate">
                        Đang đăng nhập:<br/><b className="text-slate-200 text-sm">{currentUser.fullName}</b>
                    </div>
                    <button onClick={() => {
                        setChangePwdForm({ oldPwd: '', newPwd: '', confirmPwd: '', error: '', success: '' });
                        setIsChangePwdModalOpen(true);
                    }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm text-slate-300 hover:bg-slate-800 font-medium border border-transparent hover:border-slate-700">
                        <Key size={18} /> <span>Đổi mật khẩu</span>
                    </button>
                    <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm text-red-400 hover:bg-red-500/10 font-medium border border-transparent hover:border-red-500/20">
                        <LogOut size={18} /> <span>Đăng xuất</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                {/* HEADER CÓ CHUÔNG THÔNG BÁO */}
                <header className="h-14 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md flex items-center justify-between px-6 z-20">
                    <div className="text-slate-400 text-sm">
                        {new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                    <div className="flex items-center gap-4">
                        {/* NÚT CHUÔNG THÔNG BÁO */}
                        <div className="relative">
                            <button 
                                onClick={() => setIsNotifOpen(!isNotifOpen)}
                                className="relative p-2 text-slate-400 hover:text-slate-200 transition-colors rounded-full hover:bg-slate-800"
                            >
                                <Bell size={18} />
                                {unreadNotifCount > 0 && (
                                    <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                                )}
                            </button>
                            
                            {/* BẢNG DROPDOWN THÔNG BÁO */}
                            {isNotifOpen && (
                                <div className="absolute right-0 mt-2 w-80 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50">
                                    <div className="px-4 py-3 border-b border-slate-700 font-bold text-sm bg-slate-900/50">Thông báo của bạn</div>
                                    <div className="max-h-80 overflow-y-auto">
                                        {myNotifications.length === 0 ? (
                                            <div className="p-4 text-center text-xs text-slate-500">Chưa có thông báo nào</div>
                                        ) : (
                                            myNotifications.map(n => (
                                                <div 
                                                    key={n.id} 
                                                    onClick={() => !n.isRead && markNotifAsRead(n.id)}
                                                    className={`px-4 py-3 border-b border-slate-700/50 text-sm cursor-pointer transition-colors ${!n.isRead ? 'bg-blue-900/20 hover:bg-blue-900/30' : 'hover:bg-slate-700/50 opacity-70'}`}
                                                >
                                                    <div className="flex justify-between items-start mb-1">
                                                        <div className={`${!n.isRead ? 'text-blue-400 font-medium' : 'text-slate-300'}`}>{n.message}</div>
                                                        {!n.isRead && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1.5 ml-2"></div>}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500">{new Date(n.createdAt).toLocaleString('vi-VN')}</div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <span className="text-sm border border-slate-700 bg-slate-800 px-3 py-1 rounded-full flex items-center gap-1.5 text-slate-300">
                            {currentUser.role === 'admin' ? <Shield size={14} className="text-purple-400"/> : <User size={14} className="text-blue-400"/>}
                            {currentUser.role === 'admin' ? 'Quản trị viên' : 'Nhân viên'}
                        </span>
                    </div>
                </header>

                <div className="flex-1 overflow-auto p-4 md:p-6 z-0">
                    {/* VIEW: DASHBOARD */}
                    {view === 'dashboard' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div>
                                <h2 className="text-2xl font-bold mb-1">Tổng quan</h2>
                                <p className="text-slate-400 text-sm">Báo cáo tình trạng hợp đồng thời gian thực</p>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                                <div onClick={() => { setFilterStatus('all'); setView('list'); }} className="bg-slate-800 border border-slate-700 rounded-xl p-4 cursor-pointer hover:bg-slate-750 transition-all hover:-translate-y-1 flex items-center justify-between gap-2">
                                    <div>
                                        <p className="text-slate-400 text-xs mb-0.5 line-clamp-1">Tổng số hợp đồng</p>
                                        <h3 className="text-xl font-bold text-slate-100">{stats.total}</h3>
                                    </div>
                                    <div className="w-9 h-9 bg-blue-500/20 rounded-lg flex items-center justify-center shrink-0 text-blue-500"><FileDigit size={18} /></div>
                                </div>

                                <div onClick={() => { setView('imports_report'); }} className="bg-slate-800 border border-slate-700 rounded-xl p-4 cursor-pointer hover:bg-slate-750 transition-all hover:-translate-y-1 flex items-center justify-between gap-2">
                                    <div>
                                        <p className="text-slate-400 text-xs mb-0.5 line-clamp-1">Tổng đợt nhập</p>
                                        <h3 className="text-xl font-bold text-slate-100">{stats.totalImportsCount}</h3>
                                    </div>
                                    <div className="w-9 h-9 bg-indigo-500/20 rounded-lg flex items-center justify-center shrink-0 text-indigo-400"><Package size={18} /></div>
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

                    {/* VIEW: MÀN HÌNH BÁO CÁO TỔNG ĐỢT NHẬP */}
                    {view === 'imports_report' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-8 duration-500 h-full flex flex-col">
                            <div className="flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-4">
                                    <button onClick={() => setView('dashboard')} className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                                        <ChevronLeft size={18} />
                                    </button>
                                    <div>
                                        <h2 className="text-2xl font-bold mb-1">Báo cáo chi tiết đợt nhập</h2>
                                        <p className="text-slate-400 text-sm">Tổng hợp toàn bộ lịch sử nhập vật tư của các hợp đồng</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-800 border border-slate-700 rounded-2xl flex flex-col overflow-hidden flex-1">
                                <div className="p-3 border-b border-slate-700 flex flex-wrap gap-3 shrink-0 items-center justify-between bg-slate-800/80">
                                    <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 min-w-[280px]">
                                        <Calendar className="text-slate-400" size={14}/>
                                        <span className="text-slate-400 text-xs font-medium">Từ:</span>
                                        <input 
                                            type="date" 
                                            value={importStartDate} 
                                            onChange={e => setImportStartDate(e.target.value)} 
                                            className="bg-transparent text-xs text-slate-200 focus:outline-none [color-scheme:dark] flex-1"
                                        />
                                        <span className="text-slate-400 text-xs font-medium border-l border-slate-700 pl-2">Đến:</span>
                                        <input 
                                            type="date" 
                                            value={importEndDate} 
                                            onChange={e => setImportEndDate(e.target.value)} 
                                            className="bg-transparent text-xs text-slate-200 focus:outline-none [color-scheme:dark] flex-1"
                                        />
                                        {(importStartDate || importEndDate) && (
                                            <button onClick={() => {setImportStartDate(''); setImportEndDate('');}} className="ml-1 text-slate-500 hover:text-red-400 transition-colors" title="Xóa bộ lọc ngày">
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="overflow-auto flex-1">
                                    <table className="w-full text-[12px] text-left table-fixed">
                                        <thead className="text-[11px] text-slate-400 uppercase bg-slate-900/80 sticky top-0 backdrop-blur-sm z-10">
                                            <tr>
                                                <th className="px-4 py-3 font-medium w-12">STT</th>
                                                <th className="px-4 py-3 font-medium w-32">Ngày nhập</th>
                                                <th className="px-4 py-3 font-medium w-32">Số hóa đơn</th>
                                                <th className="px-4 py-3 font-medium">Thuộc Hợp đồng</th>
                                                <th className="px-4 py-3 font-medium text-right w-44">Giá trị đợt nhập</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-700/50">
                                            {filteredImports.length > 0 && (
                                                <tr className="bg-indigo-600/15 border-b-2 border-indigo-500/30">
                                                    <td className="px-4 py-3 font-bold text-indigo-400 text-center" colSpan="4">
                                                        TỔNG CỘNG ({importsTotals.count} Đợt nhập)
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-bold text-emerald-400 text-[13px]">
                                                        {formatCurrency(importsTotals.totalValue)}
                                                    </td>
                                                </tr>
                                            )}

                                            {filteredImports.map((imp, index) => (
                                                <tr key={index} className="hover:bg-slate-700/30 transition-colors">
                                                    <td className="px-4 py-3 text-slate-500">{index + 1}</td>
                                                    <td className="px-4 py-3 text-slate-300 font-medium">{formatDisplayDate(imp.date)}</td>
                                                    <td className="px-4 py-3 font-mono text-slate-400">{imp.invoiceNum || '---'}</td>
                                                    <td className="px-4 py-3 truncate">
                                                        <span 
                                                            className="text-blue-400 hover:text-blue-300 cursor-pointer font-medium hover:underline"
                                                            onClick={() => { setActiveContractId(imp.contractId); setView('detail'); }}
                                                            title="Bấm để xem chi tiết Hợp đồng"
                                                        >
                                                            {imp.contractCode}
                                                        </span>
                                                        <span className="text-slate-500 ml-2 truncate">- {imp.contractName}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-medium text-emerald-400">
                                                        {formatCurrency(imp.value)}
                                                    </td>
                                                </tr>
                                            ))}

                                            {filteredImports.length === 0 && (
                                                <tr>
                                                    <td colSpan="5" className="px-4 py-10 text-center text-slate-500 text-sm">
                                                        Không tìm thấy đợt nhập nào trong khoảng thời gian này
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* VIEW MỚI: QUẢN LÝ CÔNG VIỆC CÓ QUY TRÌNH DUYỆT */}
                    {view === 'tasks' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 h-full flex flex-col">
                            <div className="flex items-center justify-between shrink-0">
                                <div>
                                    <h2 className="text-2xl font-bold mb-1">Quản lý Công việc</h2>
                                    <p className="text-slate-400 text-sm">Giao việc và theo dõi tiến độ công việc của đội ngũ</p>
                                </div>
                                <button onClick={() => openTaskModal()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors shadow-lg shadow-blue-500/20">
                                    <Plus size={16} /> Giao việc mới
                                </button>
                            </div>

                            <div className="bg-slate-800 border border-slate-700 rounded-2xl flex flex-col overflow-hidden flex-1">
                                <div className="overflow-auto flex-1">
                                    <table className="w-full text-[13px] text-left">
                                        <thead className="text-[11px] text-slate-400 uppercase bg-slate-900/80 sticky top-0 backdrop-blur-sm z-10 border-b border-slate-700">
                                            <tr>
                                                <th className="px-4 py-3 font-medium w-12">STT</th>
                                                <th className="px-4 py-3 font-medium">Nội dung công việc</th>
                                                <th className="px-4 py-3 font-medium w-40">Người nhận việc</th>
                                                <th className="px-4 py-3 font-medium w-36">Hạn hoàn thành</th>
                                                <th className="px-4 py-3 font-medium w-40">Trạng thái</th>
                                                <th className="px-4 py-3 font-medium text-center w-36">Thao tác</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-700/50">
                                            {visibleTasks.map((task, index) => {
                                                const status = getTaskStatus(task);
                                                const assignedUser = users.find(u => u.username === task.assignee);
                                                const assigneeName = assignedUser ? assignedUser.fullName : task.assignee;
                                                
                                                const isMyTask = task.assignee === currentUser.username;
                                                const isAssigner = task.createdBy === currentUser.username || currentUser.role === 'admin';

                                                return (
                                                    <tr key={task.id} className={`hover:bg-slate-700/30 transition-colors ${task.status === 'completed' ? 'opacity-60' : ''}`}>
                                                        <td className="px-4 py-3 text-slate-500">{index + 1}</td>
                                                        <td className="px-4 py-3 pr-8">
                                                            <div className={`font-medium ${task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-200'}`}>
                                                                {task.description}
                                                            </div>
                                                            <div className="text-[10px] text-slate-500 mt-1 mb-1">Giao bởi: {task.createdBy}</div>
                                                            
                                                            {/* HIỂN THỊ GHI CHÚ NẾU CÓ */}
                                                            {task.completionNote && (
                                                                <div className="flex gap-2 items-start mt-2 p-2 bg-slate-900/50 rounded-lg border border-slate-700/50">
                                                                    <MessageSquare size={12} className="text-blue-400 mt-0.5 shrink-0" />
                                                                    <div className="text-xs text-blue-200/80 italic leading-relaxed">"{task.completionNote}"</div>
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 text-blue-400 font-medium">{assigneeName}</td>
                                                        <td className="px-4 py-3 text-slate-300 font-mono text-xs">{formatDisplayDate(task.dueDate)}</td>
                                                        <td className="px-4 py-3">
                                                            <span className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-medium border ${status.color}`}>
                                                                {status.label}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <div className="flex items-center justify-center gap-1.5">
                                                                
                                                                {/* TRƯỜNG HỢP 1: ĐANG LÀM -> CHỈ NHÂN VIÊN ĐƯỢC BÁO CÁO XONG */}
                                                                {task.status === 'pending' && isMyTask && (
                                                                    <button 
                                                                        onClick={() => {
                                                                            setCompleteTaskForm({ id: task.id, note: '' });
                                                                            setIsCompleteTaskModalOpen(true);
                                                                        }} 
                                                                        className="px-2 py-1 text-xs font-medium rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500 hover:text-white transition-colors"
                                                                    >
                                                                        Báo cáo xong
                                                                    </button>
                                                                )}

                                                                {/* TRƯỜNG HỢP 2: ĐANG CHỜ DUYỆT -> CHỈ SẾP MỚI ĐƯỢC DUYỆT/TỪ CHỐI */}
                                                                {task.status === 'waiting' && isAssigner && (
                                                                    <>
                                                                        <button onClick={() => approveTask(task)} className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-md hover:bg-emerald-500 hover:text-white transition-colors" title="Duyệt hoàn thành">
                                                                            <CheckCircle size={16} />
                                                                        </button>
                                                                        <button onClick={() => rejectTask(task)} className="p-1.5 bg-red-500/10 text-red-400 rounded-md hover:bg-red-500 hover:text-white transition-colors" title="Từ chối (Làm lại)">
                                                                            <XCircle size={16} />
                                                                        </button>
                                                                    </>
                                                                )}

                                                                {/* NÚT SỬA/XÓA CỦA ADMIN/NGƯỜI GIAO (Bị ẩn đi nếu đang chờ duyệt để tránh sửa nhầm) */}
                                                                {isAssigner && task.status !== 'waiting' && (
                                                                    <>
                                                                        {task.status !== 'completed' && (
                                                                            <button onClick={() => openTaskModal(task)} className="p-1.5 text-slate-400 hover:text-blue-400 transition-colors" title="Sửa công việc">
                                                                                <Edit size={16} />
                                                                            </button>
                                                                        )}
                                                                        <button onClick={() => deleteTask(task.id)} className="p-1.5 text-slate-400 hover:text-red-400 transition-colors" title="Xóa công việc">
                                                                            <Trash2 size={16} />
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {visibleTasks.length === 0 && (
                                                <tr>
                                                    <td colSpan="6" className="px-4 py-12 text-center text-slate-500 text-sm">
                                                        <div className="flex justify-center mb-3 text-slate-600"><CheckSquare size={32}/></div>
                                                        Không có công việc nào.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* VIEW: DANH SÁCH HỢP ĐỒNG */}
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
                                <div className="p-3 border-b border-slate-700 flex flex-wrap gap-3 shrink-0 items-center justify-between">
                                    <div className="flex gap-3 flex-1 flex-wrap">
                                        <div className="relative flex-1 min-w-[200px] max-w-sm">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                            <input 
                                                type="text" 
                                                placeholder="Tìm kiếm số HĐ, tên HĐ, đối tác..." 
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-blue-500 transition-colors"
                                            />
                                        </div>
                                        
                                        <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 min-w-[280px]">
                                            <Calendar className="text-slate-400" size={14}/>
                                            <span className="text-slate-400 text-xs font-medium">Từ:</span>
                                            <input 
                                                type="date" 
                                                value={startDate} 
                                                onChange={e => setStartDate(e.target.value)} 
                                                className="bg-transparent text-xs text-slate-200 focus:outline-none [color-scheme:dark] flex-1"
                                            />
                                            <span className="text-slate-400 text-xs font-medium border-l border-slate-700 pl-2">Đến:</span>
                                            <input 
                                                type="date" 
                                                value={endDate} 
                                                onChange={e => setEndDate(e.target.value)} 
                                                className="bg-transparent text-xs text-slate-200 focus:outline-none [color-scheme:dark] flex-1"
                                            />
                                            {(startDate || endDate) && (
                                                <button onClick={() => {setStartDate(''); setEndDate('');}} className="ml-1 text-slate-500 hover:text-red-400 transition-colors" title="Xóa bộ lọc ngày">
                                                    <X size={14} />
                                                </button>
                                            )}
                                        </div>
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
                                                <th className="px-3 py-2.5 font-medium w-24">Số HĐ</th>
                                                <th className="px-3 py-2.5 font-medium pr-4">Tên HĐ & Đối tác</th>
                                                <th className="px-3 py-2.5 font-medium w-32">Ngày ký</th>
                                                <th className="px-3 py-2.5 font-medium w-32">Ngày hết hạn</th>
                                                <th className="px-3 py-2.5 font-medium text-center w-24">Tổng đợt nhập</th>
                                                <th className="px-3 py-2.5 font-medium w-44">Tiến độ nhập</th>
                                                <th className="px-3 py-2.5 font-medium w-36">Trạng thái</th>
                                                <th className="px-3 py-2.5 font-medium text-center w-12">Thao tác</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-700/50">
                                            {filteredContracts.length > 0 && (
                                                <tr className="bg-blue-600/15 border-b-2 border-blue-500/30">
                                                    <td className="px-3 py-3 font-bold text-blue-400 text-center" colSpan="3">
                                                        TỔNG CỘNG ({totals.count} HĐ)
                                                    </td>
                                                    <td className="px-3 py-3 text-slate-500 text-center">---</td>
                                                    <td className="px-3 py-3 text-slate-500 text-center">---</td>
                                                    <td className="px-3 py-3 font-bold text-blue-400 text-center text-sm">
                                                        {totals.importCount}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <div className="flex justify-between items-end text-xs">
                                                            <span className="text-emerald-400 font-bold" title="Tổng tiền đã nhập">{formatCurrency(totals.importedValue)}</span>
                                                            <span className="text-blue-400 font-bold ml-2" title="Tổng giá trị các HĐ">{formatCurrency(totals.totalValue)}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-3 text-slate-500 text-center" colSpan="2">---</td>
                                                </tr>
                                            )}

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
                                                        <td className="px-3 py-2.5 text-slate-300 truncate">
                                                            {formatDisplayDate(contract.signedAt)}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-slate-300 truncate">
                                                            {formatDisplayDate(contract.expiresAt)}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-center font-medium text-slate-300">
                                                            {contract.imports?.length || 0}
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
                                                    <td colSpan="9" className="px-3 py-10 text-center text-slate-500 text-sm">
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

                    {/* VIEW: CHI TIẾT HỢP ĐỒNG */}
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
                                                        <td className="py-3 text-slate-300">{formatDisplayDate(imp.date)}</td>
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
                                                    <div className="text-xs text-slate-400">Ngày giao: {formatDisplayDate(activeContract.settlement.date)}</div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-center py-6 text-slate-500 bg-slate-900/50 rounded-xl border border-dashed border-slate-700 text-sm">
                                                Hợp đồng chưa được quyết toán
                                            </div>
                                        )}
                                    </div>
                                </div>

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
                                                <span className="font-medium text-right">{formatDisplayDate(activeContract.signedAt)}</span>
                                            </div>
                                            <div className="flex justify-between border-b border-slate-700 pb-1.5">
                                                <span className="text-slate-400">Ngày hết hạn</span>
                                                <span className="font-medium text-right">{formatDisplayDate(activeContract.expiresAt)}</span>
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

                    {/* VIEW: QUẢN LÝ TÀI KHOẢN */}
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
                                                <th className="px-4 py-3 font-medium">Mật khẩu</th>
                                                <th className="px-4 py-3 font-medium">Họ và tên</th>
                                                <th className="px-4 py-3 font-medium">Quyền hạn</th>
                                                <th className="px-4 py-3 font-medium text-right">Thao tác</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-700/50">
                                            {users.map((user) => (
                                                <tr key={user.id} className="hover:bg-slate-700/30 transition-colors">
                                                    <td className="px-4 py-3 font-medium text-slate-200">{user.username}</td>
                                                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{user.password}</td>
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
                                                        {user.username !== 'admin' && (
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

            {/* MODAL MỚI: BÁO CÁO HOÀN THÀNH CÔNG VIỆC CÓ GHI CHÚ */}
            {isCompleteTaskModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-emerald-900/30 flex justify-between items-center bg-emerald-900/10">
                            <h3 className="text-base font-bold text-emerald-400 flex items-center gap-2"><CheckCircle size={16}/> Báo cáo hoàn thành</h3>
                            <button onClick={() => setIsCompleteTaskModalOpen(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div className="p-3 bg-emerald-500/10 text-emerald-200/80 text-xs rounded-xl border border-emerald-500/20 leading-relaxed">
                                Công việc sẽ được chuyển sang trạng thái <strong>Chờ duyệt</strong>. Bạn không thể tự sửa lại cho đến khi sếp phản hồi.
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1.5 text-slate-400">Ghi chú kết quả (Link Google Drive, Zalo...)</label>
                                <textarea 
                                    rows="3"
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" 
                                    value={completeTaskForm.note}
                                    onChange={e => setCompleteTaskForm({...completeTaskForm, note: e.target.value})}
                                    placeholder="Đã nhập xong hóa đơn số 123..."
                                />
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-800 flex justify-end gap-2 bg-slate-800/50">
                            <button onClick={() => setIsCompleteTaskModalOpen(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-700 transition">Hủy</button>
                            <button onClick={submitTaskCompletion} className="px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition flex items-center gap-2">
                                Gửi Báo Cáo
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL GIAO VIỆC */}
            {isTaskModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                            <h3 className="text-base font-bold flex items-center gap-2"><Briefcase size={16} className="text-blue-400"/> {taskForm.id.length > 13 ? 'Giao việc mới' : 'Sửa công việc'}</h3>
                            <button onClick={() => setIsTaskModalOpen(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-medium mb-1.5 text-slate-400">Nội dung công việc *</label>
                                <textarea 
                                    rows="3"
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" 
                                    value={taskForm.description} 
                                    onChange={e => setTaskForm({...taskForm, description: e.target.value})}
                                    placeholder="Ví dụ: Nhập liệu chứng từ kho A..."
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium mb-1.5 text-slate-400">Giao cho ai? *</label>
                                    <select 
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                                        value={taskForm.assignee}
                                        onChange={e => setTaskForm({...taskForm, assignee: e.target.value})}
                                    >
                                        {users.map(u => (
                                            <option key={u.username} value={u.username}>{u.fullName} ({u.username})</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium mb-1.5 text-slate-400">Hạn hoàn thành</label>
                                    <input 
                                        type="date" 
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 [color-scheme:dark]" 
                                        value={taskForm.dueDate} 
                                        onChange={e => setTaskForm({...taskForm, dueDate: e.target.value})} 
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-800 flex justify-end gap-2 bg-slate-800/50">
                            <button onClick={() => setIsTaskModalOpen(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-700 transition">Hủy</button>
                            <button onClick={saveTask} className="px-4 py-2 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition">Lưu Công việc</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL ĐỔI MẬT KHẨU */}
            {isChangePwdModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                            <h3 className="text-base font-bold flex items-center gap-2"><Key size={16} className="text-blue-400"/> Đổi mật khẩu</h3>
                            <button onClick={() => setIsChangePwdModalOpen(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                        </div>
                        <div className="p-4 space-y-4">
                            {changePwdForm.error && (
                                <div className="bg-red-500/10 text-red-400 border border-red-500/20 p-2 rounded-lg text-xs text-center">{changePwdForm.error}</div>
                            )}
                            {changePwdForm.success && (
                                <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 p-2 rounded-lg text-xs text-center">{changePwdForm.success}</div>
                            )}
                            <div>
                                <label className="block text-xs font-medium mb-1 text-slate-400">Mật khẩu hiện tại</label>
                                <input type="password" placeholder="••••••••" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500" value={changePwdForm.oldPwd} onChange={e => setChangePwdForm({...changePwdForm, oldPwd: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1 text-slate-400">Mật khẩu mới</label>
                                <input type="password" placeholder="••••••••" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500" value={changePwdForm.newPwd} onChange={e => setChangePwdForm({...changePwdForm, newPwd: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1 text-slate-400">Xác nhận mật khẩu mới</label>
                                <input type="password" placeholder="••••••••" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500" value={changePwdForm.confirmPwd} onChange={e => setChangePwdForm({...changePwdForm, confirmPwd: e.target.value})} />
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-800 flex justify-end gap-2 bg-slate-800/50">
                            <button onClick={() => setIsChangePwdModalOpen(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-700 transition">Hủy</button>
                            <button onClick={handleSavePassword} className="px-4 py-2 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition">Xác nhận đổi</button>
                        </div>
                    </div>
                </div>
            )}

            {/* CÁC MODALS KHÁC GIỮ NGUYÊN (Hợp đồng, Đợt nhập, Quyết toán, Quản lý User) */}
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
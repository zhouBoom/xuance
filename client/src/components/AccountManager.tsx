import React, { useState, useEffect } from 'react';
import { AccountListItem } from './AccountListItem';
import { Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { Alert } from '@mui/material';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export const AccountManager: React.FC = () => {
    const [accounts, setAccounts] = useState<any[]>([]);
    const [isOffline, setIsOffline] = useState(false);

    const sortAccounts = (accounts: { id: string; name: string; status: string }[]) => {
        return accounts.sort((a, b) => (a.status === 'offline' ? 1 : 0) - (b.status === 'offline' ? 1 : 0));
    };
    const onOpenAccountView = (account: any) => {
        console.log('onOpenAccountView', account);
    };
    useEffect(() => {
        window.electronAPI.onUpdateAccountList((from_accounts: any) => {
            console.log('onUpdateAccountList', from_accounts);
            if(!(from_accounts && from_accounts.length > 0)) return;
            setAccounts(prevAccounts => [...prevAccounts, ...from_accounts]);
            window.electronAPI.sendRendererLog({
                message: 'update-account-list',
                accounts: from_accounts
            });
        });

        window.electronAPI.onAddAccountItem((account: any) => {
            console.log('onAddAccountItem', account);
            if(!(account && account.user_id)) return;
            setAccounts(prevAccounts => {
                const existingIndex = prevAccounts.findIndex(a => a.user_id === account.user_id);
                if (existingIndex !== -1) {
                    const newAccounts = [...prevAccounts];
                    newAccounts[existingIndex] = account;
                    return newAccounts;
                } else {
                    return [...prevAccounts, account];
                }
            });
            window.electronAPI.sendRendererLog({
                message: 'add-account-item',
                account: account
            });
        });

        window.electronAPI.onUpdateAccountItem((account: any) => {
            console.log('onUpdateAccountItem', account);
            if(!(account && account.user_id)) return;
            setAccounts(prevAccounts => {
                const newAccounts = [...prevAccounts];
                const index = newAccounts.findIndex(a => a.id === account.id);
                if (index !== -1) {
                    newAccounts[index] = account;
                }
                return newAccounts;
            });
            window.electronAPI.sendRendererLog({
                message: 'update-account-item',
                account: account
            });
        });

        window.electronAPI.onNetworkStatusChange((isOnline: boolean) => {
            console.log('onNetworkStatusChange', isOnline);
            setIsOffline(!isOnline);
        });

        window.electronAPI.onLogger((data: any) => {
            console.log('main-process-log:', JSON.stringify(data));
        });

        window.electronAPI.sendReady();
    }, []);

    const handleAddAccount = () => {
        if (accounts.length >= 5) {
            toast.warn('最多添加5个账号');
        } else {
            window.electronAPI.clickAddAccountButton();
        }
    };

    return (
        <div style={{ padding: '10px' }}>
            <ToastContainer />
            {isOffline && (
                <Alert 
                    severity="warning" 
                    sx={{ marginBottom: 2 }}
                >
                    连接异常，请检查您的网络状态
                </Alert>
            )}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                <Button variant="outlined" startIcon={<AddIcon />} onClick={handleAddAccount}>
                    {accounts.length > 0 ? '切换账号' : '设置账号'}
                </Button>
            </div>
            <div style={{ 
                maxHeight: 'calc(100vh - 100px)',
                overflowY: 'auto',
                paddingRight: '5px'
            }}>
                {accounts.map((account: any) => (
                    <AccountListItem key={account.user_id} account={account} />
                ))}
            </div>
        </div>
    );
};

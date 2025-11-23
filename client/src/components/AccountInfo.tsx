import React, { useEffect, useState } from 'react';
import { Typography, Paper, Button } from '@mui/material';

export const AccountInfo: React.FC<any> = () => {
    const [account, setAccount] = useState<any>(null);
    const [isSandbox, setIsSandbox] = useState(false);
    useEffect(() => {
        window.electronAPI.onOpenAccountView((account: any) => {
            setAccount(account);
        });

        window.electronAPI.onHideViewTitleById((data: any) => {
            if(data.user_id == account?.user_id){
                setAccount({
                    ...account,
                    user_id: null
                });
            }
        });
        window.electronAPI.onIsSandbox((isSandbox: boolean) => {
            setIsSandbox(isSandbox);
        });
    }, [account]);

    if(!(account && account.user_id)){
        return (<span></span>);
    }

    return (
        (account && account.user_id) && <Paper sx={{ padding: '16px', marginLeft: '2px' }} elevation={0}>
            <Typography 
                variant="body1" 
                sx={{ 
                    fontSize: '1rem',
                    color: '#666',
                    marginLeft: '16px',
                    marginTop: '-2px',
                }}
            >
                所属帐户：{account?.nickname}
                {account?.user_id && (
                    <span style={{ marginLeft: '0px' , color: '#888' }}>
                        （{account.red_id}）
                    </span>
                )}
                <Button 
                variant="outlined" 
                sx={{ 
                    marginLeft: '20px', 
                    marginTop: '-6px', 
                    color: '#666', 
                    borderColor: '#666',
                    fontSize: '0.8rem',
                    padding: '4px 8px'
                }}
                onClick={() => {
                    window.electronAPI.hideAccountView();
                    setAccount(null);
                }}
            >
                隐藏
            </Button>
            {isSandbox && <Button 
                variant="outlined" 
                sx={{ 
                    marginLeft: '20px', 
                    marginTop: '-6px', 
                    color: '#666', 
                    borderColor: '#666',
                    fontSize: '0.8rem',
                    padding: '4px 8px'
                }}
                onClick={() => {
                    window.electronAPI.openDebug(account.user_id);
                }}
            >
                    Debug
                </Button>}
            
            </Typography>
            
        </Paper>
    );
}; 
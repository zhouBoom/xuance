import React from 'react';
import { Card, CardContent, Typography, Avatar } from '@mui/material';
import { makeStyles } from '@mui/styles';
import { AccountStatus, ACCOUNT_STATUS } from './account';
import { AccountStatusIndicator } from './AccountStatus';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

interface AccountListItemProps {
    account: {
        platform: string,
        user_id: string,
        nickname: string,
        desc: string,
        gender: string,
        images: string,
        imageb: string,
        guest: number,
        red_id: string,
        status: AccountStatus
    };
}

const useStyles = makeStyles({
    card: {
        display: 'flex',
        alignItems: 'center',
        marginBottom: '10px',
        padding: '6px',
        transition: 'transform 0.2s',
        '&:hover': {
            transform: 'scale(1.01)',
            cursor: 'pointer',
        },
    },
    avatar: {
        width: '50px',
        height: '50px',
        marginRight: '3px',
    },
});

export const AccountListItem: React.FC<AccountListItemProps> = ({ account }) => {
    const classes = useStyles();
    
    const handleClick = () => {
        // if (account.status === ACCOUNT_STATUS.IDLE) {
        //     toast.info('当前账号暂未执行任务', {
        //         position: "top-right",
        //         autoClose: 1000,
        //         hideProgressBar: false,
        //         closeOnClick: true,
        //         pauseOnHover: true,
        //         draggable: true,
        //         theme: "light"
        //     });
        // } else 
    //    if (account.status === ACCOUNT_STATUS.WORKING) {
    //         toast.info('当前账号正在工作中', {
    //             position: "top-right",
    //             autoClose: 1000,
    //             hideProgressBar: false,
    //             closeOnClick: true,
    //             pauseOnHover: true,
    //             draggable: true,
    //             theme: "light"
    //         });
    //     } else 
        if (account.status !== ACCOUNT_STATUS.INIT) {
            window.electronAPI.clickAccountItem(account.user_id);
        }
    };

    return (
        <Card 
            onClick={handleClick} 
            className={classes.card} 
            elevation={2} 
            style={{ 
                position: 'relative',
                cursor: account.status === ACCOUNT_STATUS.INIT ? 'not-allowed' : 'pointer',
                opacity: account.status === ACCOUNT_STATUS.INIT ? 0.7 : 1,
                filter: account.status === ACCOUNT_STATUS.OFFLINE ? 'grayscale(100%)' : 'none'
            }}
        >
            <div style={{
                position: 'absolute',
                top: '8px',
                right: '12px',
            }}>
                <AccountStatusIndicator status={account.status} />
            </div>
            <Avatar src={account.images} alt={`${account.nickname} avatar`} className={classes.avatar} />
            <CardContent>
                <Typography 
                    variant="body1" 
                    sx={{ 
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '200px' // 你可以根据需要调整这个值
                    }}
                >
                    昵称: {account.nickname}
                </Typography>
                <Typography variant="body2" color="textSecondary">小红书号: {account.red_id}</Typography>
                <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.6rem' }}>ID: {account.user_id}</Typography>
            </CardContent>
        </Card>
    );
}; 
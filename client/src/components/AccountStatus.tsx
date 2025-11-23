import React from 'react';
import { AccountStatus, STATUS_CONFIG } from './account';
import { Tooltip, Box, CircularProgress } from '@mui/material';

interface AccountStatusProps {
  status: AccountStatus;
}

export const AccountStatusIndicator: React.FC<AccountStatusProps> = ({ status }) => {
  const config = STATUS_CONFIG[status];
  return (
    <Tooltip title={config.label}>
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '2px',
          color: config.color,
          fontSize: '0.875rem',
        }}
      >
        {config.loading && (
          <CircularProgress
            size={12}
            thickness={4}
            sx={{ 
              color: config.color,
              marginRight: '2px'
            }}
          />
        )}
        <span>{config.label}</span>
      </Box>
    </Tooltip>
  );
}; 
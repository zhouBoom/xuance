// client/src/api/apiClient.ts
// const BASE_URL = 'http://localhost:3009';
// import axios from 'axios';

// export const apiClient = axios.create({
//     baseURL: BASE_URL,
// });

export default {}
// // Mock 数据
// export const apiClient = async (url: string, options?: RequestInit) => {
//     switch (url) {
//         case '/tasks':
//             return Promise.resolve([
//                 { id: '1', name: 'Task 1' },
//                 { id: '2', name: 'Task 2' },
//             ]);
//         case '/tasks/1':
//             return Promise.resolve({ id: '1', name: 'Task 1' });
//         case '/accounts':
//             return Promise.resolve([
//                 { id: '1', platform: 'Douyin' },
//                 { id: '2', platform: 'Kuaishou' },
//             ]);
//         case '/strategies':
//             return Promise.resolve([
//                 { id: '1', name: 'Strategy 1', active: true },
//                 { id: '2', name: 'Strategy 2', active: false },
//             ]);
//         default:
//             throw new Error(`No mock data for URL: ${url}`);
//     }
// };
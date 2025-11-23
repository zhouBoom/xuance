// import { apiClient } from './apiClient';

// // export const fetchStrategies = () => apiClient('/strategies');
// export const fetchStrategies = () => {
//     return Promise.resolve([
//         { id: '1', name: 'Strategy One', active: true },
//         { id: '2', name: 'Strategy Two', active: false },
//     ]);
// };

// // export const applyStrategy = (strategyId: string, taskId: string) => {
// //     return apiClient(`/strategies/${strategyId}/apply`, {
// //         method: 'POST',
// //         headers: { 'Content-Type': 'application/json' },
// //         body: JSON.stringify({ taskId }),
// //     });
// // };
// export const applyStrategy = (strategyId: string, taskId: string) => {
//     return Promise.resolve({ success: true, strategyId, taskId });
// };
export default {}
// // export const updateStrategy = (id: string, data: { active: boolean }) => {
// //     return apiClient(`/strategies/${id}`, {
// //         method: 'PUT',
// //         headers: { 'Content-Type': 'application/json' },
// //         body: JSON.stringify(data),
// //     });
// // };
// export const updateStrategy = (id: string, data: { active: boolean }) => {
//     return Promise.resolve({ success: true, id, updatedData: data });
// };

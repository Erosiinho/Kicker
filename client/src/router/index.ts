import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '@/views/HomeView.vue';
import RoomView from '@/views/RoomView.vue';

const routes = [
    { path: '/', component: HomeView, name: 'Home' },
    { path: '/room/:code', component: RoomView, name: 'Room', props: true },
];

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes,
});

export default router;

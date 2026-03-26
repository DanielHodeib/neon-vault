import MainHubRealtime from './MainHubRealtime';

type HubTab = 'crash' | 'crash-aviator' | 'slots' | 'blackjack' | 'roulette' | 'poker' | 'coinflip' | 'friends' | 'leaderboard' | 'quests' | 'settings' | 'admin';

export default function MainHub({ initialUsername, initialTab }: { initialUsername?: string; initialTab?: HubTab }) {
	return <MainHubRealtime initialUsername={initialUsername} initialTab={initialTab} />;
}

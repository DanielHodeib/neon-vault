import MainHubRealtime from './MainHubRealtime';

export default function MainHub({ initialUsername }: { initialUsername?: string }) {
	return <MainHubRealtime initialUsername={initialUsername} />;
}

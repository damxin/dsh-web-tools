import { type ProviderView, type QuotaView, type TestProviderView } from "./api.ts";
import { type TFunc } from "./WebToolsSection.tsx";
interface Props {
    t: TFunc;
    p: ProviderView;
    quota?: QuotaView;
    testResult?: TestProviderView;
    busy: boolean;
    /** Show the "首选" badge — only when the routing policy is "ordered". */
    showPreferred: boolean;
    inChain: boolean;
    onClose: () => void;
    onToggle: (enabled: boolean) => void;
    onBaseUrl: (url: string) => void;
    /** Toggle this provider's "bypass proxy" mark (providerProxyDirect). */
    onProxyDirect: (direct: boolean) => void;
    onTest: () => Promise<void>;
    onRefreshQuota: () => void;
    onConfigChanged: () => Promise<void> | void;
}
export declare function ProviderModal(props: Props): import("react").JSX.Element;
export {};

import type { BrowserOptions } from '@sentry/browser';

import { loadFiles } from './loader';
import { configurePublicPath } from './common/bundler';

enum OrderPermalinkStatus {
    Valid = 'valid',
    Expired = 'expired',
    RateLimited = 'rate_limited',
}

export interface CustomCheckoutWindow extends Window {
    checkoutConfig: {
        containerId: string;
        orderId?: number;
        checkoutId?: string;
        publicPath?: string;
        sentryConfig?: BrowserOptions;
        permalinkStatus?: OrderPermalinkStatus | null;
        isConsistentCrossOriginFixEnabled?: boolean;
    };
}

function isCustomCheckoutWindow(window: Window): window is CustomCheckoutWindow {
    const customCheckoutWindow: CustomCheckoutWindow = window as CustomCheckoutWindow;

    return !!customCheckoutWindow.checkoutConfig;
}

(async function autoLoad() {
    if (!isCustomCheckoutWindow(window)) {
        throw new Error('Checkout config is missing.');
    }

    if (new URLSearchParams(window.location.search).get('bopisDiagnostic') === '1') {

        configurePublicPath(window.checkoutConfig.publicPath);

        const { renderBopisDiagnostic } = await import('./bopis-diagnostic');

        renderBopisDiagnostic(window);

        return;
    }

    const { renderOrderConfirmation, renderCheckout } = await loadFiles({
        isConsistentCrossOriginFixEnabled: Boolean(
            window.checkoutConfig.isConsistentCrossOriginFixEnabled,
        ),
    });

    const {
        orderId,
        checkoutId,
        isConsistentCrossOriginFixEnabled: _isConsistentCrossOriginFixEnabled,
        ...appProps
    } = window.checkoutConfig;

    if (orderId) {
        renderOrderConfirmation({ ...appProps, orderId });
    } else if (checkoutId) {
        renderCheckout({ ...appProps, checkoutId });
    }
})();

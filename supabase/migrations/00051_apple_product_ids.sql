-- Set Apple product IDs on plans for App Store In-App Purchases
UPDATE public.plans SET apple_product_id = 'com.kindar.premium.monthly' WHERE id = 'premium_monthly';
UPDATE public.plans SET apple_product_id = 'com.kindar.premium.annual' WHERE id = 'premium_annual';
UPDATE public.plans SET apple_product_id = 'com.kindar.elite.monthly' WHERE id = 'elite_monthly';
UPDATE public.plans SET apple_product_id = 'com.kindar.elite.annual' WHERE id = 'elite_annual';

-- Index for looking up plans by apple_product_id during IAP verification
CREATE INDEX IF NOT EXISTS idx_plans_apple_product_id ON public.plans(apple_product_id) WHERE apple_product_id IS NOT NULL;

-- Index for looking up subscriptions by apple_original_transaction_id
CREATE INDEX IF NOT EXISTS idx_subscriptions_apple_txn ON public.subscriptions(apple_original_transaction_id) WHERE apple_original_transaction_id IS NOT NULL;

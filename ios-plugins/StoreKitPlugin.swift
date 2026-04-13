import Foundation
import StoreKit
import Capacitor

/// Native StoreKit 2 plugin for Apple In-App Purchases.
/// Bridges iOS StoreKit to JavaScript via Capacitor.
///
/// After running `npx cap add ios`, copy this file and StoreKitPlugin.m
/// to ios/App/App/
@objc(StoreKitPlugin)
public class StoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoreKitPlugin"
    public let jsName = "StoreKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
    ]

    // ── Get available products from App Store Connect ──
    @objc func getProducts(_ call: CAPPluginCall) {
        guard let productIds = call.getArray("productIds", String.self) else {
            call.reject("productIds required")
            return
        }

        Task {
            do {
                let products = try await Product.products(for: Set(productIds))
                let result = products.map { product -> [String: Any] in
                    return [
                        "id": product.id,
                        "title": product.displayName,
                        "description": product.description,
                        "price": product.displayPrice,
                        "priceValue": NSDecimalNumber(decimal: product.price).doubleValue,
                        "currency": product.priceFormatStyle.currencyCode ?? "BRL",
                    ]
                }
                call.resolve(["products": result])
            } catch {
                call.reject("Failed to load products: \(error.localizedDescription)")
            }
        }
    }

    // ── Purchase a product ──
    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("productId required")
            return
        }

        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    call.reject("Product not found: \(productId)")
                    return
                }

                let result = try await product.purchase()

                switch result {
                case .success(let verification):
                    let transaction = try checkVerified(verification)

                    // Get the JWS representation for server-side verification
                    let jwsRepresentation = verification.jwsRepresentation

                    await transaction.finish()

                    call.resolve([
                        "success": true,
                        "productId": transaction.productID,
                        "transactionId": String(transaction.id),
                        "originalTransactionId": String(transaction.originalID),
                        "jwsTransaction": jwsRepresentation,
                        "expirationDate": transaction.expirationDate?.timeIntervalSince1970 ?? 0,
                    ])

                case .userCancelled:
                    call.resolve(["success": false, "error": "cancelled"])

                case .pending:
                    call.resolve(["success": false, "error": "pending"])

                @unknown default:
                    call.reject("Unknown purchase result")
                }
            } catch {
                call.resolve(["success": false, "error": error.localizedDescription])
            }
        }
    }

    // ── Restore purchases ──
    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task {
            var restoredTransactions: [[String: Any]] = []

            for await verification in Transaction.currentEntitlements {
                do {
                    let transaction = try checkVerified(verification)
                    let jwsRepresentation = verification.jwsRepresentation

                    restoredTransactions.append([
                        "productId": transaction.productID,
                        "transactionId": String(transaction.id),
                        "originalTransactionId": String(transaction.originalID),
                        "jwsTransaction": jwsRepresentation,
                        "expirationDate": transaction.expirationDate?.timeIntervalSince1970 ?? 0,
                    ])
                } catch {
                    // Skip unverified transactions
                    continue
                }
            }

            call.resolve([
                "success": !restoredTransactions.isEmpty,
                "transactions": restoredTransactions,
            ])
        }
    }

    // ── Verify transaction signature ──
    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified(_, let error):
            throw error
        case .verified(let value):
            return value
        }
    }
}

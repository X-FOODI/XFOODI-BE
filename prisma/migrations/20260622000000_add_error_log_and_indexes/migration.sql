-- AlterTable
ALTER TABLE "RestaurantDocuments" ADD COLUMN IF NOT EXISTS "errorLog" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ComboDetails_comboId_idx" ON "ComboDetails"("comboId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ComboDetails_dishId_idx" ON "ComboDetails"("dishId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DishImages_dishId_idx" ON "DishImages"("dishId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DishRecipes_dishId_idx" ON "DishRecipes"("dishId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DishRecipes_ingredientId_idx" ON "DishRecipes"("ingredientId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PointsTransactions_customerId_idx" ON "PointsTransactions"("customerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PointsTransactions_orderId_idx" ON "PointsTransactions"("orderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PromotionHistories_promotionId_idx" ON "PromotionHistories"("promotionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PromotionHistories_orderId_idx" ON "PromotionHistories"("orderId");

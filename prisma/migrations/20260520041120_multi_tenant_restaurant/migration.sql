-- CreateTable
CREATE TABLE "Restaurants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "planType" TEXT NOT NULL DEFAULT 'FREE',
    "logoUrl" TEXT,
    "description" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "primaryColor" TEXT DEFAULT '#FF380B',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "Restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Users" (
    "id" TEXT NOT NULL,
    "userName" TEXT,
    "email" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'local',
    "phoneNumber" TEXT,
    "avatarUrl" TEXT,
    "fullName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "deviceInfo" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "UserSessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRoles" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "restaurantId" TEXT,

    CONSTRAINT "UserRoles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "Employees" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "userId" TEXT,
    "address" TEXT,
    "position" TEXT NOT NULL,
    "hireDate" DATE NOT NULL,
    "terminationDate" DATE,
    "salary" DECIMAL(18,2) NOT NULL,
    "salaryType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "metadata" JSONB,

    CONSTRAINT "Employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "membershipLevel" TEXT,
    "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "metadata" JSONB,

    CONSTRAINT "Customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Floors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "height" DECIMAL(8,2) NOT NULL DEFAULT 0.0,
    "width" DECIMAL(8,2) NOT NULL DEFAULT 0.0,
    "metadata" JSONB,

    CONSTRAINT "Floors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tables" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "seatingCapacity" INTEGER NOT NULL,
    "shape" TEXT NOT NULL,
    "positionX" DECIMAL(8,2) NOT NULL,
    "positionY" DECIMAL(8,2) NOT NULL,
    "width" DECIMAL(6,2) NOT NULL,
    "height" DECIMAL(6,2) NOT NULL,
    "rotation" DECIMAL(5,2) NOT NULL,
    "has3DView" BOOLEAN NOT NULL DEFAULT false,
    "viewDescription" TEXT,
    "defaultViewUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "tableStatusId" TEXT NOT NULL,
    "qrCodeUrl" TEXT,
    "floorId" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    "metadata" JSONB,
    "cubeBackImageUrl" TEXT,
    "cubeBottomImageUrl" TEXT,
    "cubeFrontImageUrl" TEXT,
    "cubeLeftImageUrl" TEXT,
    "cubeRightImageUrl" TEXT,
    "cubeTopImageUrl" TEXT,

    CONSTRAINT "Tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Table3DModels" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "modelUrl" TEXT NOT NULL,
    "modelFormat" TEXT,
    "environmentMapUrl" TEXT,
    "backgroundColor" TEXT,
    "cameraX" DECIMAL(8,4) NOT NULL,
    "cameraY" DECIMAL(8,4) NOT NULL,
    "cameraZ" DECIMAL(8,4) NOT NULL,
    "cameraFOV" DECIMAL(5,2) NOT NULL,
    "allowRotation" BOOLEAN NOT NULL,
    "allowZoom" BOOLEAN NOT NULL,
    "minZoom" DECIMAL(4,2) NOT NULL,
    "maxZoom" DECIMAL(4,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "metadata" JSONB,

    CONSTRAINT "Table3DModels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "imageUrl" TEXT,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "metadata" JSONB,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dishes" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DECIMAL(18,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "isVegetarian" BOOLEAN NOT NULL DEFAULT false,
    "isSpicy" BOOLEAN NOT NULL DEFAULT false,
    "isBestSeller" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoDisableByStock" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "metadata" JSONB,

    CONSTRAINT "Dishes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishImages" (
    "id" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "imageType" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,

    CONSTRAINT "DishImages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngredientCategories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "metadata" JSONB,

    CONSTRAINT "IngredientCategories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "metadata" JSONB,

    CONSTRAINT "Suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingredients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "minStockLevel" DECIMAL(10,3) NOT NULL,
    "maxStockLevel" DECIMAL(10,3) NOT NULL,
    "supplierId" TEXT,
    "type" TEXT,
    "isActive" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "ingredientCategoryId" TEXT,
    "status" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,

    CONSTRAINT "Ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryStocks" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "currentQuantity" DECIMAL(10,3) NOT NULL,
    "lastRestockDate" TIMESTAMP(3),
    "lastUpdated" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "metadata" JSONB,

    CONSTRAINT "InventoryStocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransactions" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "transactionType" TEXT,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "metadata" JSONB,

    CONSTRAINT "StockTransactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishRecipes" (
    "id" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "metadata" JSONB,

    CONSTRAINT "DishRecipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealCombos" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT,
    "baseCost" DECIMAL(18,2) NOT NULL,
    "price" DECIMAL(18,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "metadata" JSONB,

    CONSTRAINT "MealCombos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComboDetails" (
    "id" TEXT NOT NULL,
    "comboId" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "metadata" JSONB,

    CONSTRAINT "ComboDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyPointBands" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "min" INTEGER NOT NULL,
    "max" INTEGER,
    "discountPercentage" DECIMAL(5,2) NOT NULL,
    "benefitDescription" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "logoColor" TEXT,
    "metadata" JSONB,

    CONSTRAINT "LoyaltyPointBands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notifications" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT,
    "recipientId" TEXT,
    "notificationType" TEXT,
    "isBroadcast" BOOLEAN NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "imageUrl" TEXT,
    "priority" TEXT,
    "isPublished" BOOLEAN NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "metadata" JSONB,

    CONSTRAINT "Notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discountValue" DECIMAL(18,2) NOT NULL,
    "discountType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "maxDiscountAmount" DECIMAL(18,2) NOT NULL,
    "minOrderAmount" DECIMAL(18,2) NOT NULL,
    "usageLimit" INTEGER NOT NULL,
    "usagePerCustomer" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "metadata" JSONB,

    CONSTRAINT "Promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionApplicableItems" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "dishId" TEXT,
    "categoryId" TEXT,
    "comboId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "metadata" JSONB,

    CONSTRAINT "PromotionApplicableItems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusTypes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "metadata" JSONB,

    CONSTRAINT "StatusTypes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusValues" (
    "id" TEXT NOT NULL,
    "statusTypeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colorCode" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "metadata" JSONB,
    "displayOrder" INTEGER NOT NULL DEFAULT 1,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "StatusValues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeSchedules" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "startTime" TIME NOT NULL,
    "endTime" TIME NOT NULL,
    "checkInTime" TIMESTAMP(3),
    "checkOutTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "statusId" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "EmployeeSchedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationTables" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservationTables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservations" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "numberOfGuests" INTEGER NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
    "specialRequests" TEXT,
    "depositAmount" DECIMAL(18,2) NOT NULL,
    "checkedInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "reservationStatusId" TEXT NOT NULL,
    "confirmationCode" TEXT,
    "metadata" JSONB,
    "paymentDeadline" TIMESTAMP(3),

    CONSTRAINT "Reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Orders" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "customerId" TEXT,
    "reservationId" TEXT,
    "subTotal" DECIMAL(18,2) NOT NULL,
    "discountAmount" DECIMAL(18,2) NOT NULL,
    "taxAmount" DECIMAL(18,2) NOT NULL,
    "serviceCharge" DECIMAL(18,2) NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "handledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "orderStatusId" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "Orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderDetails" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "dishId" TEXT,
    "quantity" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "itemStatusId" TEXT NOT NULL,
    "metadata" JSONB,
    "unitPrice" DECIMAL(18,2) NOT NULL DEFAULT 0.0,
    "comboPrice" DECIMAL(18,2),
    "comboName" TEXT,
    "comboId" TEXT,
    "parentId" TEXT,

    CONSTRAINT "OrderDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethods" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentMethods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "reservationId" TEXT,
    "paymentMethodId" TEXT NOT NULL,
    "transactionId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "cashReceive" DECIMAL(18,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cashback" DECIMAL(18,2) NOT NULL,
    "refundDate" TIMESTAMP(3),
    "processedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "checkoutUrl" TEXT,
    "payOSOrderCode" BIGINT,
    "metadata" JSONB,
    "status" INTEGER NOT NULL DEFAULT 0,
    "purpose" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointsTransactions" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "orderId" TEXT,
    "sourceType" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "metadata" JSONB,

    CONSTRAINT "PointsTransactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionHistories" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "discountAmount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "metadata" JSONB,

    CONSTRAINT "PromotionHistories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableSessions" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "orderId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "metadata" JSONB,

    CONSTRAINT "TableSessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedbacks" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "isPublished" BOOLEAN NOT NULL,
    "isAnonymous" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "metadata" JSONB,

    CONSTRAINT "Feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackImages" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "isCover" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "metadata" JSONB,

    CONSTRAINT "FeedbackImages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIChatSessions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "restaurantId" TEXT,
    "customerId" TEXT,
    "tableId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "metadata" JSONB,

    CONSTRAINT "AIChatSessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIChatMessages" (
    "id" TEXT NOT NULL,
    "aiChatSessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "metadata" JSONB,

    CONSTRAINT "AIChatMessages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Restaurants_slug_key" ON "Restaurants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Roles_name_key" ON "Roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Users_userName_key" ON "Users"("userName");

-- CreateIndex
CREATE UNIQUE INDEX "Users_email_key" ON "Users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserSessions_refreshToken_key" ON "UserSessions"("refreshToken");

-- CreateIndex
CREATE INDEX "UserSessions_userId_idx" ON "UserSessions"("userId");

-- CreateIndex
CREATE INDEX "UserRoles_restaurantId_idx" ON "UserRoles"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "Employees_userId_key" ON "Employees"("userId");

-- CreateIndex
CREATE INDEX "Employees_restaurantId_idx" ON "Employees"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "Employees_code_restaurantId_key" ON "Employees"("code", "restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "Customers_userId_key" ON "Customers"("userId");

-- CreateIndex
CREATE INDEX "Floors_restaurantId_idx" ON "Floors"("restaurantId");

-- CreateIndex
CREATE INDEX "Tables_restaurantId_idx" ON "Tables"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "Tables_code_restaurantId_key" ON "Tables"("code", "restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "Table3DModels_tableId_key" ON "Table3DModels"("tableId");

-- CreateIndex
CREATE INDEX "Categories_restaurantId_idx" ON "Categories"("restaurantId");

-- CreateIndex
CREATE INDEX "Dishes_restaurantId_idx" ON "Dishes"("restaurantId");

-- CreateIndex
CREATE INDEX "Dishes_categoryId_idx" ON "Dishes"("categoryId");

-- CreateIndex
CREATE INDEX "Dishes_isActive_idx" ON "Dishes"("isActive");

-- CreateIndex
CREATE INDEX "Dishes_isBestSeller_idx" ON "Dishes"("isBestSeller");

-- CreateIndex
CREATE INDEX "IngredientCategories_restaurantId_idx" ON "IngredientCategories"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "IngredientCategories_code_restaurantId_key" ON "IngredientCategories"("code", "restaurantId");

-- CreateIndex
CREATE INDEX "Suppliers_restaurantId_idx" ON "Suppliers"("restaurantId");

-- CreateIndex
CREATE INDEX "Ingredients_restaurantId_idx" ON "Ingredients"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredients_code_restaurantId_key" ON "Ingredients"("code", "restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryStocks_ingredientId_key" ON "InventoryStocks"("ingredientId");

-- CreateIndex
CREATE INDEX "StockTransactions_ingredientId_idx" ON "StockTransactions"("ingredientId");

-- CreateIndex
CREATE INDEX "StockTransactions_createdAt_idx" ON "StockTransactions"("createdAt");

-- CreateIndex
CREATE INDEX "MealCombos_restaurantId_idx" ON "MealCombos"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "MealCombos_code_restaurantId_key" ON "MealCombos"("code", "restaurantId");

-- CreateIndex
CREATE INDEX "Notifications_restaurantId_idx" ON "Notifications"("restaurantId");

-- CreateIndex
CREATE INDEX "Notifications_recipientId_idx" ON "Notifications"("recipientId");

-- CreateIndex
CREATE INDEX "Notifications_isPublished_idx" ON "Notifications"("isPublished");

-- CreateIndex
CREATE INDEX "Notifications_createdAt_idx" ON "Notifications"("createdAt");

-- CreateIndex
CREATE INDEX "Promotions_restaurantId_idx" ON "Promotions"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "Promotions_code_restaurantId_key" ON "Promotions"("code", "restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "StatusTypes_code_key" ON "StatusTypes"("code");

-- CreateIndex
CREATE INDEX "EmployeeSchedules_employeeId_idx" ON "EmployeeSchedules"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeSchedules_workDate_idx" ON "EmployeeSchedules"("workDate");

-- CreateIndex
CREATE INDEX "EmployeeSchedules_statusId_idx" ON "EmployeeSchedules"("statusId");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationTables_reservationId_tableId_key" ON "ReservationTables"("reservationId", "tableId");

-- CreateIndex
CREATE UNIQUE INDEX "Reservations_confirmationCode_key" ON "Reservations"("confirmationCode");

-- CreateIndex
CREATE INDEX "Reservations_restaurantId_idx" ON "Reservations"("restaurantId");

-- CreateIndex
CREATE INDEX "Reservations_customerId_idx" ON "Reservations"("customerId");

-- CreateIndex
CREATE INDEX "Reservations_reservationStatusId_idx" ON "Reservations"("reservationStatusId");

-- CreateIndex
CREATE INDEX "Reservations_time_idx" ON "Reservations"("time");

-- CreateIndex
CREATE UNIQUE INDEX "Orders_reference_key" ON "Orders"("reference");

-- CreateIndex
CREATE INDEX "Orders_restaurantId_idx" ON "Orders"("restaurantId");

-- CreateIndex
CREATE INDEX "Orders_customerId_idx" ON "Orders"("customerId");

-- CreateIndex
CREATE INDEX "Orders_reservationId_idx" ON "Orders"("reservationId");

-- CreateIndex
CREATE INDEX "Orders_orderStatusId_idx" ON "Orders"("orderStatusId");

-- CreateIndex
CREATE INDEX "Orders_createdAt_idx" ON "Orders"("createdAt");

-- CreateIndex
CREATE INDEX "Orders_handledBy_idx" ON "Orders"("handledBy");

-- CreateIndex
CREATE INDEX "OrderDetails_orderId_idx" ON "OrderDetails"("orderId");

-- CreateIndex
CREATE INDEX "OrderDetails_dishId_idx" ON "OrderDetails"("dishId");

-- CreateIndex
CREATE INDEX "OrderDetails_comboId_idx" ON "OrderDetails"("comboId");

-- CreateIndex
CREATE INDEX "OrderDetails_itemStatusId_idx" ON "OrderDetails"("itemStatusId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethods_code_key" ON "PaymentMethods"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Payments_payOSOrderCode_key" ON "Payments"("payOSOrderCode");

-- CreateIndex
CREATE INDEX "Payments_orderId_idx" ON "Payments"("orderId");

-- CreateIndex
CREATE INDEX "Payments_reservationId_idx" ON "Payments"("reservationId");

-- CreateIndex
CREATE INDEX "Payments_status_idx" ON "Payments"("status");

-- CreateIndex
CREATE INDEX "Payments_paymentDate_idx" ON "Payments"("paymentDate");

-- CreateIndex
CREATE INDEX "TableSessions_tableId_idx" ON "TableSessions"("tableId");

-- CreateIndex
CREATE INDEX "TableSessions_isActive_idx" ON "TableSessions"("isActive");

-- CreateIndex
CREATE INDEX "TableSessions_startedAt_idx" ON "TableSessions"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Feedbacks_orderId_customerId_key" ON "Feedbacks"("orderId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "AIChatSessions_sessionId_key" ON "AIChatSessions"("sessionId");

-- CreateIndex
CREATE INDEX "AIChatSessions_restaurantId_idx" ON "AIChatSessions"("restaurantId");

-- AddForeignKey
ALTER TABLE "Restaurants" ADD CONSTRAINT "Restaurants_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSessions" ADD CONSTRAINT "UserSessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRoles" ADD CONSTRAINT "UserRoles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRoles" ADD CONSTRAINT "UserRoles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRoles" ADD CONSTRAINT "UserRoles_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employees" ADD CONSTRAINT "Employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employees" ADD CONSTRAINT "Employees_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customers" ADD CONSTRAINT "Customers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Floors" ADD CONSTRAINT "Floors_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tables" ADD CONSTRAINT "Tables_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tables" ADD CONSTRAINT "Tables_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tables" ADD CONSTRAINT "Tables_tableStatusId_fkey" FOREIGN KEY ("tableStatusId") REFERENCES "StatusValues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table3DModels" ADD CONSTRAINT "Table3DModels_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Categories" ADD CONSTRAINT "Categories_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Categories" ADD CONSTRAINT "Categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Dishes" ADD CONSTRAINT "Dishes_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dishes" ADD CONSTRAINT "Dishes_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishImages" ADD CONSTRAINT "DishImages_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientCategories" ADD CONSTRAINT "IngredientCategories_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suppliers" ADD CONSTRAINT "Suppliers_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredients" ADD CONSTRAINT "Ingredients_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredients" ADD CONSTRAINT "Ingredients_ingredientCategoryId_fkey" FOREIGN KEY ("ingredientCategoryId") REFERENCES "IngredientCategories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredients" ADD CONSTRAINT "Ingredients_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStocks" ADD CONSTRAINT "InventoryStocks_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransactions" ADD CONSTRAINT "StockTransactions_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishRecipes" ADD CONSTRAINT "DishRecipes_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishRecipes" ADD CONSTRAINT "DishRecipes_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealCombos" ADD CONSTRAINT "MealCombos_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboDetails" ADD CONSTRAINT "ComboDetails_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "MealCombos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboDetails" ADD CONSTRAINT "ComboDetails_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dishes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notifications" ADD CONSTRAINT "Notifications_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotions" ADD CONSTRAINT "Promotions_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionApplicableItems" ADD CONSTRAINT "PromotionApplicableItems_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionApplicableItems" ADD CONSTRAINT "PromotionApplicableItems_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dishes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PromotionApplicableItems" ADD CONSTRAINT "PromotionApplicableItems_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PromotionApplicableItems" ADD CONSTRAINT "PromotionApplicableItems_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "MealCombos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "StatusValues" ADD CONSTRAINT "StatusValues_statusTypeId_fkey" FOREIGN KEY ("statusTypeId") REFERENCES "StatusTypes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSchedules" ADD CONSTRAINT "EmployeeSchedules_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSchedules" ADD CONSTRAINT "EmployeeSchedules_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "StatusValues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationTables" ADD CONSTRAINT "ReservationTables_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationTables" ADD CONSTRAINT "ReservationTables_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservations" ADD CONSTRAINT "Reservations_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservations" ADD CONSTRAINT "Reservations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservations" ADD CONSTRAINT "Reservations_reservationStatusId_fkey" FOREIGN KEY ("reservationStatusId") REFERENCES "StatusValues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orders" ADD CONSTRAINT "Orders_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orders" ADD CONSTRAINT "Orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Orders" ADD CONSTRAINT "Orders_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Orders" ADD CONSTRAINT "Orders_handledBy_fkey" FOREIGN KEY ("handledBy") REFERENCES "Employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OrderDetails" ADD CONSTRAINT "OrderDetails_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDetails" ADD CONSTRAINT "OrderDetails_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dishes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OrderDetails" ADD CONSTRAINT "OrderDetails_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "MealCombos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OrderDetails" ADD CONSTRAINT "OrderDetails_itemStatusId_fkey" FOREIGN KEY ("itemStatusId") REFERENCES "StatusValues"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OrderDetails" ADD CONSTRAINT "OrderDetails_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "OrderDetails"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Payments" ADD CONSTRAINT "Payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Payments" ADD CONSTRAINT "Payments_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Payments" ADD CONSTRAINT "Payments_processedBy_fkey" FOREIGN KEY ("processedBy") REFERENCES "Employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Payments" ADD CONSTRAINT "Payments_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsTransactions" ADD CONSTRAINT "PointsTransactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PointsTransactions" ADD CONSTRAINT "PointsTransactions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PromotionHistories" ADD CONSTRAINT "PromotionHistories_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionHistories" ADD CONSTRAINT "PromotionHistories_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSessions" ADD CONSTRAINT "TableSessions_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Tables"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TableSessions" ADD CONSTRAINT "TableSessions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Feedbacks" ADD CONSTRAINT "Feedbacks_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Feedbacks" ADD CONSTRAINT "Feedbacks_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "FeedbackImages" ADD CONSTRAINT "FeedbackImages_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedbacks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIChatSessions" ADD CONSTRAINT "AIChatSessions_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIChatMessages" ADD CONSTRAINT "AIChatMessages_aiChatSessionId_fkey" FOREIGN KEY ("aiChatSessionId") REFERENCES "AIChatSessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "AIChatSessions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "customerId" TEXT,
    "tableId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,

    CONSTRAINT "AIChatSessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIChatMessages" (
    "id" TEXT NOT NULL,
    "aiChatSessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,

    CONSTRAINT "AIChatMessages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Roles" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "normalizedName" TEXT,
    "concurrencyStamp" TEXT,

    CONSTRAINT "Roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleClaims" (
    "id" SERIAL NOT NULL,
    "roleId" TEXT NOT NULL,
    "claimType" TEXT,
    "claimValue" TEXT,

    CONSTRAINT "RoleClaims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Users" (
    "id" TEXT NOT NULL,
    "memberId" TEXT,
    "lastLoginTime" TIMESTAMP(3),
    "lastModified" TIMESTAMP(3) NOT NULL,
    "refreshToken" TEXT,
    "refreshTokenExpiryTime" TIMESTAMP(3),
    "pushNotificationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "userName" TEXT,
    "normalizedUserName" TEXT,
    "email" TEXT,
    "normalizedEmail" TEXT,
    "emailConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT,
    "securityStamp" TEXT,
    "concurrencyStamp" TEXT,
    "phoneNumber" TEXT,
    "phoneNumberConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lockoutEnd" TIMESTAMP(3),
    "lockoutEnabled" BOOLEAN NOT NULL DEFAULT false,
    "accessFailedCount" INTEGER NOT NULL DEFAULT 0,
    "avatarUrl" TEXT,
    "fullName" TEXT,

    CONSTRAINT "Users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserClaims" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "claimType" TEXT,
    "claimValue" TEXT,

    CONSTRAINT "UserClaims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLogins" (
    "loginProvider" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "providerDisplayName" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "UserLogins_pkey" PRIMARY KEY ("loginProvider","providerKey")
);

-- CreateTable
CREATE TABLE "UserRoles" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "UserRoles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "UserTokens" (
    "userId" TEXT NOT NULL,
    "loginProvider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT,

    CONSTRAINT "UserTokens_pkey" PRIMARY KEY ("userId","loginProvider","name")
);

-- CreateTable
CREATE TABLE "Employees" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "position" TEXT NOT NULL,
    "hireDate" DATE NOT NULL,
    "terminationDate" DATE,
    "salary" DECIMAL(18,2) NOT NULL,
    "salaryType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,

    CONSTRAINT "Employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customers" (
    "id" TEXT NOT NULL,
    "applicationUserId" TEXT NOT NULL,
    "membershipLevel" TEXT,
    "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,

    CONSTRAINT "Customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Floors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "height" DECIMAL(8,2) NOT NULL DEFAULT 0.0,
    "width" DECIMAL(8,2) NOT NULL DEFAULT 0.0,
    "propertiesJson" TEXT,

    CONSTRAINT "Floors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tables" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
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
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "tableStatusId" INTEGER NOT NULL DEFAULT 0,
    "qrCodeUrl" TEXT,
    "floorId" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    "propertiesJson" TEXT,
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
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,

    CONSTRAINT "Table3DModels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dishes" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DECIMAL(18,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "isVegetarian" BOOLEAN NOT NULL DEFAULT false,
    "isSpicy" BOOLEAN NOT NULL DEFAULT false,
    "isBestSeller" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoDisableByStock" BOOLEAN NOT NULL DEFAULT false,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,

    CONSTRAINT "Dishes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishImages" (
    "id" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "imageType" INTEGER NOT NULL DEFAULT 0,
    "propertiesJson" TEXT,

    CONSTRAINT "DishImages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngredientCategories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,

    CONSTRAINT "IngredientCategories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,

    CONSTRAINT "Suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingredients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "minStockLevel" DECIMAL(10,3) NOT NULL,
    "maxStockLevel" DECIMAL(10,3) NOT NULL,
    "supplierId" TEXT,
    "type" TEXT,
    "isActive" BOOLEAN NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "ingredientCategoryId" TEXT,
    "status" INTEGER NOT NULL DEFAULT 0,
    "propertiesJson" TEXT,

    CONSTRAINT "Ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryStocks" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "currentQuantity" DECIMAL(10,3) NOT NULL,
    "lastRestockDate" TIMESTAMP(3),
    "lastUpdated" TIMESTAMP(3) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,

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
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,

    CONSTRAINT "StockTransactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishRecipes" (
    "id" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,

    CONSTRAINT "DishRecipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealCombos" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT,
    "baseCost" DECIMAL(18,2) NOT NULL,
    "price" DECIMAL(18,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,

    CONSTRAINT "MealCombos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComboDetails" (
    "id" TEXT NOT NULL,
    "comboId" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,

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
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "logoColor" TEXT,
    "propertiesJson" TEXT,

    CONSTRAINT "LoyaltyPointBands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notifications" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT,
    "notificationType" TEXT,
    "isBroadcast" BOOLEAN NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "imageUrl" TEXT,
    "priority" TEXT,
    "isPublished" BOOLEAN NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,

    CONSTRAINT "Notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discountValue" DECIMAL(18,2) NOT NULL,
    "discountType" TEXT,
    "maxDiscountAmount" DECIMAL(18,2) NOT NULL,
    "minOrderAmount" DECIMAL(18,2) NOT NULL,
    "usageLimit" INTEGER NOT NULL,
    "usagePerCustomer" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,

    CONSTRAINT "Promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionApplicableItems" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "dishId" TEXT,
    "categoryId" TEXT,
    "comboId" TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,

    CONSTRAINT "PromotionApplicableItems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusTypes" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,

    CONSTRAINT "StatusTypes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusValues" (
    "id" SERIAL NOT NULL,
    "statusTypeId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colorCode" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,
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
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "statusId" INTEGER NOT NULL DEFAULT 0,
    "propertiesJson" TEXT,

    CONSTRAINT "EmployeeSchedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservations" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "numberOfGuests" INTEGER NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
    "specialRequests" TEXT,
    "depositAmount" DECIMAL(18,2) NOT NULL,
    "checkedInAt" TIMESTAMP(3),
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "reservationStatusId" INTEGER NOT NULL DEFAULT 0,
    "confirmationCode" TEXT,
    "propertiesJson" TEXT,
    "paymentDeadline" TIMESTAMP(3),

    CONSTRAINT "Reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Orders" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
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
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "orderStatusId" INTEGER NOT NULL DEFAULT 0,
    "propertiesJson" TEXT,

    CONSTRAINT "Orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderDetails" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "dishId" TEXT,
    "quantity" INTEGER NOT NULL,
    "note" TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "itemStatusId" INTEGER NOT NULL DEFAULT 0,
    "propertiesJson" TEXT,
    "unitPrice" DECIMAL(18,2) NOT NULL DEFAULT 0.0,
    "comboId" TEXT,
    "parentId" TEXT,

    CONSTRAINT "OrderDetails_pkey" PRIMARY KEY ("id")
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
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "checkoutUrl" TEXT,
    "payOSOrderCode" BIGINT,
    "propertiesJson" TEXT,
    "status" INTEGER NOT NULL DEFAULT 0,
    "purpose" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointsTransactions" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT,
    "points" INTEGER NOT NULL,
    "orderId" TEXT NOT NULL,
    "description" TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,

    CONSTRAINT "PointsTransactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionHistories" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "discountAmount" DECIMAL(18,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,

    CONSTRAINT "PromotionHistories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableSessions" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "reservationId" TEXT,
    "orderId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,

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
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,

    CONSTRAINT "Feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackImages" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "isCover" BOOLEAN NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,

    CONSTRAINT "FeedbackImages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriggerGroups" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "logicType" INTEGER NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,

    CONSTRAINT "TriggerGroups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriggerObjects" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "objectName" TEXT,
    "fullAssemblyName" TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,

    CONSTRAINT "TriggerObjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Triggers" (
    "id" TEXT NOT NULL,
    "type" INTEGER NOT NULL,
    "triggerObjectId" INTEGER NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,

    CONSTRAINT "Triggers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriggerActions" (
    "id" SERIAL NOT NULL,
    "triggerId" TEXT NOT NULL,
    "type" INTEGER NOT NULL,
    "action" TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,

    CONSTRAINT "TriggerActions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriggerCriteria" (
    "id" SERIAL NOT NULL,
    "triggerId" TEXT NOT NULL,
    "triggerCriteriaGroupId" INTEGER,
    "type" INTEGER NOT NULL,
    "logicType" INTEGER NOT NULL,
    "propertyName" TEXT,
    "propertyValue" TEXT,
    "computedDescription" TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "propertiesJson" TEXT,

    CONSTRAINT "TriggerCriteria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AIChatSessions_sessionId_key" ON "AIChatSessions"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Roles_normalizedName_key" ON "Roles"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "Users_memberId_key" ON "Users"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "Users_userName_key" ON "Users"("userName");

-- CreateIndex
CREATE UNIQUE INDEX "Users_normalizedUserName_key" ON "Users"("normalizedUserName");

-- CreateIndex
CREATE UNIQUE INDEX "Users_email_key" ON "Users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Users_normalizedEmail_key" ON "Users"("normalizedEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Employees_code_key" ON "Employees"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Customers_applicationUserId_key" ON "Customers"("applicationUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Tables_code_key" ON "Tables"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Table3DModels_tableId_key" ON "Table3DModels"("tableId");

-- CreateIndex
CREATE UNIQUE INDEX "IngredientCategories_code_key" ON "IngredientCategories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredients_code_key" ON "Ingredients"("code");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryStocks_ingredientId_key" ON "InventoryStocks"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "MealCombos_code_key" ON "MealCombos"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Promotions_code_key" ON "Promotions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "StatusTypes_code_key" ON "StatusTypes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Reservations_confirmationCode_key" ON "Reservations"("confirmationCode");

-- CreateIndex
CREATE UNIQUE INDEX "Orders_reference_key" ON "Orders"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Payments_payOSOrderCode_key" ON "Payments"("payOSOrderCode");

-- CreateIndex
CREATE UNIQUE INDEX "Feedbacks_orderId_customerId_key" ON "Feedbacks"("orderId", "customerId");

-- AddForeignKey
ALTER TABLE "AIChatMessages" ADD CONSTRAINT "AIChatMessages_aiChatSessionId_fkey" FOREIGN KEY ("aiChatSessionId") REFERENCES "AIChatSessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleClaims" ADD CONSTRAINT "RoleClaims_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Users" ADD CONSTRAINT "Users_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserClaims" ADD CONSTRAINT "UserClaims_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLogins" ADD CONSTRAINT "UserLogins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRoles" ADD CONSTRAINT "UserRoles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRoles" ADD CONSTRAINT "UserRoles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTokens" ADD CONSTRAINT "UserTokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customers" ADD CONSTRAINT "Customers_applicationUserId_fkey" FOREIGN KEY ("applicationUserId") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tables" ADD CONSTRAINT "Tables_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table3DModels" ADD CONSTRAINT "Table3DModels_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Categories" ADD CONSTRAINT "Categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Dishes" ADD CONSTRAINT "Dishes_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishImages" ADD CONSTRAINT "DishImages_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "ComboDetails" ADD CONSTRAINT "ComboDetails_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "MealCombos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboDetails" ADD CONSTRAINT "ComboDetails_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dishes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "Reservations" ADD CONSTRAINT "Reservations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservations" ADD CONSTRAINT "Reservations_reservationStatusId_fkey" FOREIGN KEY ("reservationStatusId") REFERENCES "StatusValues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "TableSessions" ADD CONSTRAINT "TableSessions_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TableSessions" ADD CONSTRAINT "TableSessions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Feedbacks" ADD CONSTRAINT "Feedbacks_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Feedbacks" ADD CONSTRAINT "Feedbacks_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "FeedbackImages" ADD CONSTRAINT "FeedbackImages_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedbacks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Triggers" ADD CONSTRAINT "Triggers_triggerObjectId_fkey" FOREIGN KEY ("triggerObjectId") REFERENCES "TriggerObjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriggerActions" ADD CONSTRAINT "TriggerActions_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "Triggers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriggerCriteria" ADD CONSTRAINT "TriggerCriteria_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "Triggers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriggerCriteria" ADD CONSTRAINT "TriggerCriteria_triggerCriteriaGroupId_fkey" FOREIGN KEY ("triggerCriteriaGroupId") REFERENCES "TriggerGroups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

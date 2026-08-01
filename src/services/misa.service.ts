import axios from 'axios';
import crypto from 'crypto';
import { HttpsProxyAgent } from 'https-proxy-agent';

interface MisaToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  UserID: string;
  CompanyID: number;
  TaxCode: string;
  OrganizationUnitID: string;
  expiresAt: number;
}

interface MisaTemplate {
  IPTemplateID: string;
  CompanyID: number;
  TemplateName: string;
  InvTemplateNo: string;
  InvSeries: string;
  OrgInvSeries: string;
  TemplateType: number;
  InvoiceType: number;
  IsInheritFromOldTemplate: boolean;
}

export interface MisaInvoiceInput {
  // Payment/order info
  referenceCode: string;   // order reference or reservation code
  totalAmount: number;     // total amount in VND (inclusive of VAT)
  description: string;     // invoice line item description

  // Buyer info
  companyName: string;
  taxId: string;
  address: string;
  email: string;
}

export interface MisaInvoiceResult {
  refId: string;
  lookupCode: string;
}

class MisaService {
  private token: MisaToken | null = null;
  private template: MisaTemplate | null = null;

  private get apiUrl() {
    return process.env.MISA_API_URL || 'https://testapp.meinvoice.vn/api/v2';
  }
  private get username() {
    return process.env.MISA_USERNAME || 'testmisa@yahoo.com';
  }
  private get password() {
    return process.env.MISA_PASSWORD || '123456Aa';
  }
  private get taxCode() {
    return process.env.MISA_TAX_CODE || '2222222222-444';
  }

  private get httpsAgent() {
    const proxyUrl = process.env.QUOTAGUARDSTATIC_URL?.trim() || process.env.FIXIE_URL?.trim();
    if (proxyUrl) {
      try {
        return new HttpsProxyAgent(proxyUrl);
      } catch (e: any) {
        console.warn('[MISA] Proxy agent creation failed:', e?.message);
      }
    }
    return undefined;
  }

  private async getToken(): Promise<MisaToken> {
    if (this.token && Date.now() < this.token.expiresAt) {
      return this.token;
    }

    const response = await axios.post(
      `${this.apiUrl}/oauth`,
      `grant_type=password&username=${encodeURIComponent(this.username.trim())}&password=${encodeURIComponent(this.password.trim())}`,
      {
        headers: {
          'taxcode': this.taxCode,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
        httpsAgent: this.httpsAgent,
      }
    );

    const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    if (!data.access_token) {
      throw new Error(`MISA OAuth failed: ${data.error_description || data.error || 'No access token'}`);
    }

    this.token = {
      ...data,
      expiresAt: Date.now() + (data.expires_in - 300) * 1000,
    };
    return this.token!;
  }

  private async getTemplate(): Promise<MisaTemplate> {
    if (this.template) return this.template;

    const token = await this.getToken();
    const activeTaxCode = token.TaxCode || this.taxCode;

    const response = await axios.post(
      `${this.apiUrl}/v3common/code/template`,
      {
        TypeInvoice: 0,
        TaxCode: activeTaxCode,
        UserName: this.username,
        Password: this.password,
      },
      {
        headers: {
          'Authorization': `Bearer ${token.access_token}`,
          'TaxCode': activeTaxCode,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
        httpsAgent: this.httpsAgent,
      }
    );

    if (!response.data.success) {
      throw new Error(`Failed to get MISA template: ${response.data.dataError || response.data.errorCode}`);
    }

    const templates: MisaTemplate[] = JSON.parse(response.data.data);
    if (!templates || templates.length === 0) throw new Error('No MISA templates found');

    this.template = templates[0];
    return this.template;
  }

  public async publishInvoice(input: MisaInvoiceInput): Promise<MisaInvoiceResult> {
    const token = await this.getToken();
    const activeTaxCode = token.TaxCode || this.taxCode;
    const template = await this.getTemplate();

    const refId = crypto.randomUUID();
    const refDetailId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Calculate 8% VAT (inclusive)
    const vatRate = 8.0;
    const totalSaleAmount = input.totalAmount / (1 + vatRate / 100);
    const totalVatAmount = input.totalAmount - totalSaleAmount;

    const payload = {
      RefID: refId,
      CompanyID: token.CompanyID,
      OrganizationUnitID: token.OrganizationUnitID,
      UserID: token.UserID,
      InvoiceType: template.InvoiceType,
      InvTemplateNo: template.InvTemplateNo,
      InvoiceTemplateID: template.IPTemplateID,
      IsInheritFromOldTemplate: template.IsInheritFromOldTemplate,
      InvDate: now,
      InvNo: '<Chưa cấp số>',
      SourceType: 0,
      SendInvoiceStatus: 0,
      SendNumber: 0,
      CurrencyCode: 'VND',
      CurrencyID: 'VND',
      ExchangeRate: 1.0,
      TypeDiscount: 0,
      DiscountRate: 0.0,
      IsMoreVATRate: false,
      VATRate: vatRate,
      ExchangeRateOperation: 0.0,
      EInvoiceStatus: 2,
      PaymentStatus: 0,
      PaymentRule: 0,
      ApproveStep: 1,
      IsPublish: true,
      CreatedDate: now,
      ModifiedDate: now,
      EditVersion: 0,
      OrgInvoiceType: 1,
      TotalSaleAmountOC: totalSaleAmount,
      TotalSaleAmount: totalSaleAmount,
      TotalVATAmountOC: totalVatAmount,
      TotalVATAmount: totalVatAmount,
      TotalDiscountAmountOC: 0.0,
      TotalDiscountAmount: 0.0,
      TotalAmountOC: input.totalAmount,
      TotalAmount: input.totalAmount,
      AccountObjectTaxCode: input.taxId,
      AccountObjectName: input.companyName,
      AccountObjectCode: '',
      AccountObjectAddress: input.address,
      ContactName: input.companyName,
      ReceiverEmail: input.email,
      ReceiverName: input.companyName,
      ReceiverMobile: '',
      PaymentMethod: 'TM/CK',
      IsTaxReduction43: true,
      InvoiceDetails: [
        {
          RefDetailID: refDetailId,
          RefID: refId,
          InventoryItemType: 1,
          InventoryItemCode: 'DVAN',
          Description: input.description,
          UnitName: 'Lần',
          Quantity: 1.0,
          UnitPrice: totalSaleAmount,
          AmountOC: totalSaleAmount,
          Amount: totalSaleAmount,
          DiscountRate: 0.0,
          DiscountAmountOC: 0.0,
          DiscountAmount: 0.0,
          VATRate: vatRate,
          VATAmountOC: totalVatAmount,
          VATAmount: totalVatAmount,
          SortOrder: 1,
          SortOrderView: 1,
        },
      ],
    };

    const response = await axios.post(
      `${this.apiUrl}/v3sainvoice/Code`,
      [payload],
      {
        headers: {
          'Authorization': `Bearer ${token.access_token}`,
          'TaxCode': activeTaxCode,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
        httpsAgent: this.httpsAgent,
      }
    );

    if (!response.data.success) {
      throw new Error(`MISA Publish Error: ${response.data.dataError || response.data.errorMessage || JSON.stringify(response.data.errorCode)}`);
    }

    if (!response.data.data) {
      const dataAdditional = response.data.dataAdditional
        ? (typeof response.data.dataAdditional === 'string' ? JSON.parse(response.data.dataAdditional) : response.data.dataAdditional)
        : null;
      const errorMsg = dataAdditional?.[0]?.Errors?.[0]?.Message || 'MISA từ chối dữ liệu';
      throw new Error(errorMsg);
    }

    let results = typeof response.data.data === 'string' ? JSON.parse(response.data.data) : response.data.data;

    // Normalize response format
    if (results && !Array.isArray(results) && typeof results === 'object') {
      const values = Object.values(results);
      if (values.length > 0) {
        let firstVal: any = values[0];
        if (firstVal.Data && typeof firstVal.Data === 'string') {
          try { firstVal = JSON.parse(firstVal.Data); } catch { /* ignore */ }
        }
        if (firstVal.ErrorMessage) throw new Error(`MISA từ chối: ${firstVal.ErrorMessage}`);
        results = [firstVal];
      }
    }

    if (!Array.isArray(results) || results.length === 0) {
      throw new Error('MISA trả về kết quả không hợp lệ');
    }

    const result = results[0];
    if (result.Success === false || result.ErrorMessage) {
      throw new Error(`MISA từ chối: ${result.ErrorMessage || 'Lỗi không xác định'}`);
    }

    return {
      refId: result.RefID || refId,
      lookupCode: result.InvoiceCode || result.RefID || refId,
    };
  }
}

export const misaService = new MisaService();

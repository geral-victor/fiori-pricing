import Controller from 'sap/ui/core/mvc/Controller';
import JSONModel from 'sap/ui/model/json/JSONModel';
import MessageToast from 'sap/m/MessageToast';
import MessageBox from 'sap/m/MessageBox';
import Input from 'sap/m/Input';
import Event from 'sap/ui/base/Event';
import type {
  GetSkuByManufacturerAndMpnRequestBody,
  GetSkuByManufacturerAndMpnResponseBody,
  GetPricingAndStockBySkuRequestBody,
  GetPricingAndStockBySkuResponse,
  PricingTier,
  PricingAndStockInfo,
} from '@GERAL-STT/component-pricing-api';

interface ResultItem {
  supplier: string;
  sku: string;
  manufacturer: string;
  mpn: string;
  description: string;
  pricingLoading: boolean;
  pricing: PricingAndStockInfo | null;
  pricingError: string | null;
  highlight: string;
}

/**
 * @namespace project1.controller
 */
export default class View1 extends Controller {
  public onInit(): void {
    const oModel = new JSONModel({
      results: [],
      loading: false,
      requiredQuantity: null,
    });
    this.getView()?.setModel(oModel, 'componentData');
  }

  public async onSearch(): Promise<void> {
    const oInput = this.byId('componentInput') as Input;
    const sQuery = oInput.getValue().trim();

    if (!sQuery) {
      MessageToast.show('Please enter a component query');
      return;
    }

    const oModel = this.getView()?.getModel('componentData') as JSONModel;
    oModel.setProperty('/loading', true);
    oModel.setProperty('/results', []);

    try {
      const requestBody: GetSkuByManufacturerAndMpnRequestBody = {
        query: sQuery,
      };

      MessageToast.show('Searching for component...');

      const startTime = performance.now();
      const response = await fetch(
        'http://localhost:3000/api/get-sku-by-manufacturer-and-mpn',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        },
      );
      const endTime = performance.now();
      const fetchingTime = endTime - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `API request failed: ${String(response.status)} - ${errorText}`,
        );
      }

      const data =
        (await response.json()) as unknown as GetSkuByManufacturerAndMpnResponseBody;

      if (data.skuList.length > 0) {
        // Initialize results with SKU data and loading state for pricing
        const results = data.skuList.map((sku) => ({
          ...sku,
          pricingLoading: true,
          pricing: null,
          pricingError: null,
        }));
        oModel.setProperty('/results', results);

        MessageToast.show(
          `Found ${String(data.skuList.length)} component(s) in ${(fetchingTime / 1000).toFixed(2)}s. Fetching pricing...`,
        );

        // Fetch pricing for all SKUs in parallel
        data.skuList.forEach((sku, index) => {
          this.fetchPricingForSku(sku.sku, sku.supplier, index, oModel).catch(
            (error: unknown) => {
              console.error(
                `Failed to fetch pricing for SKU ${sku.sku}:`,
                error,
              );
            },
          );
        });
      } else {
        MessageBox.information('No components found for the given query.');
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      MessageBox.error(`Failed to search components:\n${errorMessage}`);
      console.error('Error searching components:', error);
    } finally {
      oModel.setProperty('/loading', false);
    }
  }

  private async fetchPricingForSku(
    sku: string,
    supplier: string,
    index: number,
    oModel: JSONModel,
  ): Promise<void> {
    try {
      const requestBody: GetPricingAndStockBySkuRequestBody = {
        supplierName: supplier,
        skuList: [sku],
      };

      const response = await fetch(
        'http://localhost:3000/api/get-pricing-and-stock-by-sku',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch pricing: ${String(response.status)}`);
      }

      const pricingData =
        (await response.json()) as unknown as GetPricingAndStockBySkuResponse;

      // Update the specific item with pricing data (take first item from array)
      const pricingInfo = pricingData.PricingAndStockList[0];
      oModel.setProperty(`/results/${String(index)}/pricing`, pricingInfo);
      oModel.setProperty(`/results/${String(index)}/pricingLoading`, false);
      
      // Recalculate highlights if a required quantity is set
      this.onQuantityChange();
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      oModel.setProperty(
        `/results/${String(index)}/pricingError`,
        errorMessage,
      );
      oModel.setProperty(`/results/${String(index)}/pricingLoading`, false);
    }
  }

  public formatPrice(price: number, currency: string): string {
    if (!price || !currency) return '';
    return `@ ${price.toFixed(3).padStart(8, ' ')} ${currency}`;
  }

  public onQuantityChange(oEvent?: Event): void {
    const oModel = this.getView()?.getModel('componentData') as JSONModel;
    const requiredQuantity = this.getRequiredQuantity(oEvent, oModel);
    const results = this.getResults(oModel);

    if (!this.isValidQuantity(requiredQuantity) || !results.length) {
      this.clearAllHighlights(results, oModel);
      return;
    }

    const bestUnitPrice = this.findBestUnitPrice(results, requiredQuantity);
    this.highlightBestPrices(results, requiredQuantity, bestUnitPrice, oModel);
  }

  private getRequiredQuantity(oEvent: Event | undefined, oModel: JSONModel): number {
    if (oEvent) {
      const oInput = oEvent.getSource<Input>();
      const sValue = oInput.getValue();
      const quantity = sValue ? parseFloat(sValue) : 0;
      oModel.setProperty('/requiredQuantity', quantity);
      return quantity;
    }
    return oModel.getProperty('/requiredQuantity') as number;
  }

  private getResults(oModel: JSONModel): ResultItem[] {
    return oModel.getProperty('/results') as ResultItem[];
  }

  private isValidQuantity(quantity: number): boolean {
    return !!(quantity && quantity > 0);
  }

  private clearAllHighlights(results: ResultItem[], oModel: JSONModel): void {
    results.forEach((_result, index) => {
      oModel.setProperty(`/results/${String(index)}/highlight`, 'false');
    });
  }

  private findBestUnitPrice(results: ResultItem[], requiredQuantity: number): number {
    return results.reduce((best, result) => {
      if (this.hasValidPricing(result) && result.pricing?.current.pricing) {
        const unitPrice = this.calculateUnitPrice(result.pricing.current.pricing, requiredQuantity);
        return Math.min(best, unitPrice);
      }
      return best;
    }, Infinity);
  }

  private highlightBestPrices(
    results: ResultItem[],
    requiredQuantity: number,
    bestUnitPrice: number,
    oModel: JSONModel
  ): void {
    results.forEach((result, index) => {
      const highlight = this.shouldHighlight(result, requiredQuantity, bestUnitPrice) ? 'true' : 'false';
      oModel.setProperty(`/results/${String(index)}/highlight`, highlight);
    });
  }

  private hasValidPricing(result: ResultItem): boolean {
    return !result.pricingLoading && !result.pricingError && !!result.pricing?.current.pricing;
  }

  private shouldHighlight(result: ResultItem, requiredQuantity: number, bestUnitPrice: number): boolean {
    if (!this.hasValidPricing(result) || !result.pricing?.current.pricing) {
      return false;
    }

    const unitPrice = this.calculateUnitPrice(result.pricing.current.pricing, requiredQuantity);
    return Math.abs(unitPrice - bestUnitPrice) < 0.001;
  }

  private calculateUnitPrice(pricingTiers: PricingTier[], quantity: number): number {
    if (!pricingTiers.length) {
      return Infinity;
    }

    // Sort pricing tiers by minQuantity in ascending order
    const sortedTiers = [...pricingTiers].sort((a, b) => a.minQuantity - b.minQuantity);

    // Find the applicable tier (highest minQuantity that is <= required quantity)
    let applicableTier = null;
    for (const tier of sortedTiers) {
      if (quantity >= tier.minQuantity) {
        applicableTier = tier;
        // Continue to find higher quantity tiers if they apply
      } else {
        // Once we hit a tier above our quantity, stop
        break;
      }
    }

    // If no tier matches (quantity is below the minimum), return Infinity
    // This means this supplier cannot fulfill the requested quantity
    if (!applicableTier) {
      return Infinity;
    }

    return applicableTier.price;
  }
}

import Controller from 'sap/ui/core/mvc/Controller';
import TypedJSONModel from 'sap/ui/model/json/TypedJSONModel';
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
  PricingSnapshot,
} from '@GERAL-STT/component-pricing-api';

interface PriceTierWithApplicable extends PricingTier {
  isApplicable: string; // 'true' | 'false'
}

type PricingSnapshotWithApplicableTiers = PricingSnapshot & {
  pricing: PriceTierWithApplicable[];
};

interface ResultItem {
  supplier: string;
  sku: string;
  manufacturer: string;
  mpn: string;
  description: string;
  pricingLoading: boolean;
  pricing: PricingSnapshotWithApplicableTiers | null;
  pricingError: string | null;
  highlight: string; // 'true' | 'false'
  inferredMpn: string; // The inferred MPN from user input
}

interface ComponentData {
  results: ResultItem[];
  loading: boolean;
  requiredQuantity: number | null;
}

/**
 * @namespace project1.controller
 */
export default class View1 extends Controller {
  private componentModel!: TypedJSONModel<ComponentData>;

  public onInit(): void {
    this.componentModel = new TypedJSONModel<ComponentData>({
      results: [],
      loading: false,
      requiredQuantity: null,
    });
    this.getView()?.setModel(this.componentModel, 'componentData');
  }

  public async onSearch(): Promise<void> {
    const oInput = this.byId('componentInput') as Input;
    const sQuery = oInput.getValue().trim();

    if (!sQuery) {
      MessageToast.show('Please enter a component query');
      return;
    }

    this.componentModel.setProperty('/loading', true);
    this.componentModel.setProperty('/results', []);

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

      if (data.warnings && data.warnings.length > 0) {
        MessageBox.warning(
          `Warnings during search:\n- ${data.warnings.map((w) => `${w.apiName}: ${w.message}`).join('\n- ')}`,
        );
      }

      if (data.skuList.length > 0) {
        // Initialize results with SKU data and loading state for pricing
        const results: ResultItem[] = data.skuList.map((sku) => ({
          ...sku,
          pricingLoading: true,
          pricing: null,
          pricingError: null,
          highlight: 'false',
          inferredMpn: data.inferedMpn || '',
        }));
        this.componentModel.setProperty('/results', results);

        MessageToast.show(
          `Found ${String(data.skuList.length)} component(s) in ${(fetchingTime / 1000).toFixed(2)}s. Fetching pricing...`,
        );

        // Fetch pricing for all SKUs in parallel
        data.skuList.forEach((sku, index) => {
          this.fetchPricingForSku(sku.sku, sku.supplier, index).catch(
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
      this.componentModel.setProperty('/loading', false);
    }
  }

  private async fetchPricingForSku(
    sku: string,
    supplier: string,
    index: number,
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
      const currentPricingSnapshot =
        pricingData.PricingAndStockList[0]?.current;
      if (currentPricingSnapshot === undefined) {
        throw new Error('No pricing data available');
      }

      const pricing: PricingSnapshotWithApplicableTiers = {
        ...currentPricingSnapshot,
        pricing: currentPricingSnapshot.pricing.map((tier) => ({
          ...tier,
          isApplicable: 'false',
        })),
      };

      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      this.componentModel.setProperty(`/results/${index}/pricing`, pricing);
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      this.componentModel.setProperty(`/results/${index}/pricingLoading`, false);

      // Recalculate highlights if a required quantity is set
      this.onQuantityChange();
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      this.componentModel.setProperty(`/results/${index}/pricingError`, errorMessage);
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      this.componentModel.setProperty(`/results/${index}/pricingLoading`, false);
    }
  }

  public formatPrice(price: number, currency: string): string {
    if (!price || !currency) return '';
    return `@ ${price.toFixed(3).padStart(8, ' ')} ${currency}`;
  }

  public formatMpnWithHighlight(mpn: string, inferredMpn: string): string {
    if (!mpn || !inferredMpn || inferredMpn.trim() === '') {
      return mpn || '';
    }

    // Escape HTML special characters
    const escapeHtml = (str: string): string => {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    // Normalize strings by removing special characters for comparison
    const normalize = (str: string): string => {
      return str.replace(/[-_.\s]/g, '');
    };

    const normalizedMpn = normalize(mpn).toLowerCase();
    const normalizedInferredMpn = normalize(inferredMpn).toLowerCase();

    // Find the position of the inferred MPN in the normalized actual MPN
    const startIndex = normalizedMpn.indexOf(normalizedInferredMpn);
    
    if (startIndex === -1) {
      // No match found, return the original MPN escaped
      return escapeHtml(mpn);
    }

    // Map the position back to the original string
    let normalizedPos = 0;
    let originalStartIndex = -1;
    let originalEndIndex = -1;

    for (let i = 0; i < mpn.length; i++) {
      const char = mpn[i];
      if (char === undefined) {
        throw new Error('Unexpected undefined character in MPN string');
      }
      // Check if this character would be in the normalized string
      if (!/[-_.\s]/.test(char)) {
        if (normalizedPos === startIndex && originalStartIndex === -1) {
          originalStartIndex = i;
        }
        if (normalizedPos === startIndex + normalizedInferredMpn.length - 1) {
          originalEndIndex = i + 1;
          break;
        }
        normalizedPos++;
      }
    }

    if (originalStartIndex === -1 || originalEndIndex === -1) {
      return escapeHtml(mpn);
    }

    // Build the highlighted string
    const before = escapeHtml(mpn.substring(0, originalStartIndex));
    const match = escapeHtml(mpn.substring(originalStartIndex, originalEndIndex));
    const after = escapeHtml(mpn.substring(originalEndIndex));

    return `${before}<span style="background-color: #ffd90069; color: #000; font-weight: bold;">${match}</span>${after}`;
  }

  public onQuantityChange(oEvent?: Event): void {
    const requiredQuantity = this.getRequiredQuantity(oEvent);
    const results = this.getResults();

    if (!this.isValidQuantity(requiredQuantity) || !results.length) {
      this.clearAllHighlights(results);
      this.clearAllApplicableTiers(results);
      return;
    }

    const bestUnitPrice = this.findBestUnitPrice(results, requiredQuantity);
    this.highlightBestPrices(results, requiredQuantity, bestUnitPrice);
    this.updateApplicableTiers(results, requiredQuantity);
  }

  private getRequiredQuantity(oEvent?: Event): number {
    if (oEvent) {
      const oInput = oEvent.getSource<Input>();
      const sValue = oInput.getValue();
      const quantity = sValue ? parseFloat(sValue) : 0;
      this.componentModel.setProperty('/requiredQuantity', quantity);
      return quantity;
    }
    return this.componentModel.getProperty('/requiredQuantity') ?? 0;
  }

  private getResults(): ResultItem[] {
    return this.componentModel.getProperty('/results');
  }

  private isValidQuantity(quantity: number): boolean {
    return !!(quantity && quantity > 0);
  }

  private clearAllHighlights(results: ResultItem[]): void {
    results.forEach((_result, index) => {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      this.componentModel.setProperty(`/results/${index}/highlight`, 'false');
    });
  }

  private clearAllApplicableTiers(results: ResultItem[]): void {
    results.forEach((result, resultIndex) => {
      if (result.pricing?.pricing) {
        const updatedPricing: PricingSnapshotWithApplicableTiers = {
          ...result.pricing,
          pricing: result.pricing.pricing.map(tier => ({
            ...tier,
            isApplicable: 'false'
          }))
        };
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        this.componentModel.setProperty(`/results/${resultIndex}/pricing`, updatedPricing);
      }
    });
  }

  private updateApplicableTiers(
    results: ResultItem[],
    requiredQuantity: number,
  ): void {
    results.forEach((result, resultIndex) => {
      if (!this.hasValidPricing(result) || !result.pricing?.pricing) {
        return;
      }

      const pricingTiers = result.pricing.pricing;
      const sortedTiers = [...pricingTiers].sort(
        (a, b) => a.minQuantity - b.minQuantity,
      );

      // Find the applicable tier (last tier where requiredQuantity >= minQuantity)
      const applicableTierIndex = sortedTiers.reduce(
        (lastIndex, tier, index) => 
          requiredQuantity >= tier.minQuantity ? index : lastIndex,
        -1
      );

      // Update isApplicable for all tiers
      const updatedPricing: PricingSnapshotWithApplicableTiers = {
        ...result.pricing,
        pricing: pricingTiers.map(tier => ({
          ...tier,
          isApplicable: applicableTierIndex >= 0 && 
            tier === sortedTiers[applicableTierIndex] ? 'true' : 'false'
        }))
      };
      
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      this.componentModel.setProperty(`/results/${resultIndex}/pricing`, updatedPricing);
    });
  }

  private findBestUnitPrice(
    results: ResultItem[],
    requiredQuantity: number,
  ): number {
    return results.reduce((best, result) => {
      if (this.hasValidPricing(result) && result.pricing?.pricing) {
        const unitPrice = this.calculateUnitPrice(
          result.pricing.pricing,
          requiredQuantity,
        );
        return Math.min(best, unitPrice);
      }
      return best;
    }, Infinity);
  }

  private highlightBestPrices(
    results: ResultItem[],
    requiredQuantity: number,
    bestUnitPrice: number,
  ): void {
    results.forEach((result, index) => {
      const highlight = this.shouldHighlight(
        result,
        requiredQuantity,
        bestUnitPrice,
      )
        ? 'true'
        : 'false';
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      this.componentModel.setProperty(`/results/${index}/highlight`, highlight);
    });
  }

  private hasValidPricing(result: ResultItem): boolean {
    return (
      !result.pricingLoading &&
      !result.pricingError &&
      !!result.pricing?.pricing
    );
  }

  private shouldHighlight(
    result: ResultItem,
    requiredQuantity: number,
    bestUnitPrice: number,
  ): boolean {
    if (!this.hasValidPricing(result) || !result.pricing?.pricing) {
      return false;
    }

    const unitPrice = this.calculateUnitPrice(
      result.pricing.pricing,
      requiredQuantity,
    );
    return Math.abs(unitPrice - bestUnitPrice) < 0.001;
  }

  private calculateUnitPrice(
    pricingTiers: PricingTier[],
    quantity: number,
  ): number {
    if (!pricingTiers.length) {
      return Infinity;
    }

    // Sort pricing tiers by minQuantity in ascending order
    const sortedTiers = [...pricingTiers].sort(
      (a, b) => a.minQuantity - b.minQuantity,
    );

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

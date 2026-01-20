import Controller from 'sap/ui/core/mvc/Controller';
import JSONModel from 'sap/ui/model/json/JSONModel';
import MessageToast from 'sap/m/MessageToast';
import MessageBox from 'sap/m/MessageBox';
import Input from 'sap/m/Input';
import type {
  GetSkuByManufacturerAndMpnRequestBody,
  GetSkuByManufacturerAndMpnResponseBody,
  GetPricingAndStockBySkuRequestBody,
  GetPricingAndStockBySkuResponse,
} from '@GERAL-STT/component-pricing-api';

/**
 * @namespace project1.controller
 */
export default class View1 extends Controller {
  public onInit(): void {
    const oModel = new JSONModel({
      results: [],
      loading: false,
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
}

"""Turn the shipped model into one small ONNX file the phone can run."""
import json
from pathlib import Path
import numpy as np
import onnx
import onnxruntime
import torch
from onnx import TensorProto, helper, numpy_helper
from onnxruntime.quantization import QuantType, quantize_dynamic
from .config import IMAGE_SIZE, RESULTS, STORED_SIZE

# Where the web build picks the model up from; Git ignores this folder
WEB_MODEL = Path(__file__).resolve().parents[3] / 'apps' / 'web' / 'public' / 'models' / 'dish'
# Tensors smaller than this are left alone, because halving them saves almost nothing
SMALLEST_HALVED = 1024


def export_onnx(model, path, image_size=IMAGE_SIZE):
    """Write a model as ONNX with one fixed-size input, on the CPU."""
    # Use the plain attention path, because the fused one does not export cleanly
    for block in model.blocks:
        if hasattr(block, 'attn'):
            block.attn.fused_attn = False

    # Trace one fixed input, which is all the phone will ever send
    model.cpu().eval()
    torch.onnx.export(model, torch.zeros(1, 3, image_size, image_size), str(path), input_names=['pixels'], output_names=['logits'], opset_version=18, dynamo=False)


def quantise(float_path, small_path):
    """Write a copy with 8-bit weights, about a quarter of the size."""
    quantize_dynamic(str(float_path), str(small_path), weight_type=QuantType.QUInt8, op_types_to_quantize=['MatMul', 'Gemm'])


def halve_weights(float_path, small_path):
    """
    Write a copy with every large weight stored in 16 bits, and widened again when the model loads.

    SigLIP2 tells hundreds of similar food names apart by small margins, so 8-bit weights
    changed its first guess on most photos, while 16-bit weights hardly change it at all.
    """
    model = onnx.load(str(float_path))
    stored, widen = [], []
    for weight in model.graph.initializer:
        # Ignore anything that is not a large float weight, because there is nothing to gain
        if weight.data_type != TensorProto.FLOAT or np.prod(weight.dims) < SMALLEST_HALVED:
            stored.append(weight)
            continue

        # Keep the half-size values under a new name, and let a Cast node produce the old name
        half = numpy_helper.from_array(numpy_helper.to_array(weight).astype(np.float16), name=f'{weight.name}_half')
        stored.append(half)
        widen.append(helper.make_node('Cast', [half.name], [weight.name], to=TensorProto.FLOAT))

    # Put the Cast nodes first, because a graph must define a value before using it
    nodes = widen + list(model.graph.node)
    del model.graph.initializer[:]
    model.graph.initializer.extend(stored)
    del model.graph.node[:]
    model.graph.node.extend(nodes)
    onnx.save(model, str(small_path))


def run_onnx(path, pixels):
    """Return an ONNX model's logits for a batch of photos, on the CPU."""
    session = onnxruntime.InferenceSession(str(path), providers=['CPUExecutionProvider'])
    outputs = [session.run(None, {'pixels': pixels[index:index + 1]})[0] for index in range(len(pixels))]
    return np.concatenate(outputs)


def write_web_files(model_path, dishes, mean, std, folder=WEB_MODEL):
    """Copy the model and the facts the phone needs next to it."""
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'model.onnx').write_bytes(Path(model_path).read_bytes())
    (folder / 'labels.json').write_text(json.dumps({'dishes': dishes, 'mean': mean, 'std': std, 'storedSize': STORED_SIZE, 'imageSize': IMAGE_SIZE, 'modelBytes': Path(model_path).stat().st_size}), encoding='utf-8')


def save_result(name, record):
    """Write one result file, as the permanent record of a run."""
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / name).write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')

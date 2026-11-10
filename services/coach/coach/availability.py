"""Keep the hosted models in the order to ask them, so whichever is available answers."""
from .hosted_models import HOSTED_MODELS

# The front of this queue is asked first, and a model that fails moves to the back, so none
# of them is a fixed first choice. The table's order only says where a freshly started service begins.
queue = list(HOSTED_MODELS)


def asking_order(names):
    """Return the given model names, sorted by their place in the queue."""
    return sorted(names, key=queue.index)


def send_to_back(name):
    """
    Move a model that just failed behind the others.

    Its tokens may come back, so it stays in the queue and is simply asked last.
    """
    queue.remove(name)
    queue.append(name)
